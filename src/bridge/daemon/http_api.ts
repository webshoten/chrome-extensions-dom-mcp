import type { BrowserToolName, NetworkQuery } from "../protocol/types.ts";
import { MCPHttpTransport } from "../mcp/http_transport.ts";
import { BrowserService } from "./browser_service.ts";
import { WebSocketBridge } from "./ws_bridge.ts";

const REQUEST_TIMEOUT_MS = 10_000;

function timeoutSignal(
  ms: number,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(message: string, status = 200): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

const BROWSER_TOOLS = new Set<BrowserToolName>([
  "list_tabs",
  "get_dom",
  "get_network",
  "get_console",
  "click",
  "fill",
  "wait_for",
  "navigate",
  "take_screenshot",
]);

// daemonのHTTP入口で受け付けるtool名を、Chrome拡張へ送れるbrowser toolだけに限定します。
function isBrowserToolName(value: string): value is BrowserToolName {
  return BROWSER_TOOLS.has(value as BrowserToolName);
}

/*
 * # daemon HTTP API
 *
 * ## 目的
 * AI AgentやMCPプロセスからのHTTP requestと、Chrome拡張からのWebSocket接続を同じlocalhost入口で受ける。
 *
 * ## 説明
 * 外側には/statusや/tool/<toolName>を公開し、Chrome拡張との実通信は/wsへ分離する。
 */
export class DOMServer {
  readonly #service: BrowserService;
  readonly #mcp: MCPHttpTransport;
  #lastToolCallAt = new Map<BrowserToolName, string>();

  constructor(
    private readonly addr: string,
    private readonly bridge: WebSocketBridge,
  ) {
    this.#service = new BrowserService(bridge);
    this.#mcp = new MCPHttpTransport(this.#service);
  }

  // daemonの公開HTTP surfaceです。tool追加時も基本的には/tool/<toolName>へ寄せます。
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return textResponse("ok\n");
    }
    if (url.pathname === "/status") {
      return this.#handleStatus(request);
    }
    if (url.pathname === "/mcp") {
      return await this.#mcp.handleRequest(request);
    }
    if (url.pathname === "/get-dom") {
      return await this.#handleLegacyGetDOM(request);
    }
    if (url.pathname === "/get-network") {
      return await this.#handleLegacyGetNetwork(request);
    }
    if (url.pathname.startsWith("/tool/")) {
      return await this.#handleTool(request, url);
    }
    if (url.pathname === "/ws") {
      return this.bridge.handleWebSocket(request);
    }
    return textResponse("not found\n", 404);
  }

  // 拡張接続と直近tool実行を、ユーザーやAIが状態確認できる形で返します。
  #handleStatus(request: Request): Response {
    if (request.method !== "GET") {
      return textResponse("method not allowed\n", 405);
    }
    return jsonResponse(this.getStatus());
  }

  // Desktop UIと/statusが同じ実行状態を表示するためのsnapshotです。
  getStatus(): Record<string, unknown> {
    return {
      ok: true,
      extensionConnections: this.bridge.clientCount,
      mcpEndpoint: `http://${this.addr}/mcp`,
      lastGetDOMAt: this.#lastToolCallAt.get("get_dom") ?? null,
      lastGetNetworkAt: this.#lastToolCallAt.get("get_network") ?? null,
      lastToolCalls: Object.fromEntries(this.#lastToolCallAt),
    };
  }

  // curl確認や古い呼び出し元向けの互換入口です。新しいI/Fは/tool/get_domを使います。
  async #handleLegacyGetDOM(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return textResponse("method not allowed\n", 405);
    }
    return await this.#runTool("get_dom", {});
  }

  // curl確認や古い呼び出し元向けの互換入口です。新しいI/Fは/tool/get_networkを使います。
  async #handleLegacyGetNetwork(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return textResponse("method not allowed\n", 405);
    }

    let query: NetworkQuery = {};
    try {
      const body = await request.text();
      query = body.trim() === "" ? {} : JSON.parse(body);
    } catch (error) {
      return textResponse(`parse network query: ${error}\n`, 400);
    }

    return await this.#runTool("get_network", query);
  }

  // browser toolの標準入口です。payloadはここでは解釈せず、tool実行境界へ渡します。
  async #handleTool(request: Request, url: URL): Promise<Response> {
    if (request.method !== "POST") {
      return textResponse("method not allowed\n", 405);
    }

    const name = decodeURIComponent(url.pathname.slice("/tool/".length));
    if (!isBrowserToolName(name)) {
      return textResponse(`unknown browser tool: ${name}\n`, 404);
    }

    let payload: unknown = {};
    try {
      const body = await request.text();
      payload = body.trim() === "" ? {} : JSON.parse(body);
    } catch (error) {
      return textResponse(`parse tool payload: ${error}\n`, 400);
    }

    return await this.#runTool(name, payload);
  }

  // HTTP request単位のtimeoutと状態記録を担い、Chrome拡張側の結果をHTTP responseへ戻します。
  async #runTool(name: BrowserToolName, payload: unknown): Promise<Response> {
    const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);
    try {
      const result = await this.#service.callTool(
        name,
        payload,
        timeout.signal,
      );
      this.#lastToolCallAt.set(name, new Date().toISOString());
      return jsonResponse(result);
    } catch (error) {
      return textResponse(
        `${error instanceof Error ? error.message : error}\n`,
        503,
      );
    } finally {
      timeout.cancel();
    }
  }
}
