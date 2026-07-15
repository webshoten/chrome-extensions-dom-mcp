import { ProxyDOMGetter } from "../daemon/http_api.ts";
import {
  type BrowserToolRunner,
  callMCPTool,
  isKnownToolName,
  MCP_TOOLS,
} from "./tools.ts";

type JsonRpcID = string | number | null;

type MCPRequest = {
  jsonrpc: string;
  id?: JsonRpcID;
  method: string;
  params?: unknown;
};

type MCPResponse = {
  jsonrpc: "2.0";
  id?: JsonRpcID;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type ToolCallParams = {
  name?: string;
  arguments?: unknown;
};

const REQUEST_TIMEOUT_MS = 10_000;

// MCP request単位の待ち時間を制限し、daemonや拡張未応答時にAI Agentへエラーを返します。
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

// browser toolのJSON文字列を、MCPのtool result形式へ包みます。
function textToolResult(text: string): Record<string, unknown> {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    isError: false,
  };
}

/*
 * # MCP stdio server
 *
 * ## 目的
 * AI Agentからstdioで起動され、MCP JSON-RPC requestをdaemonのbrowser tool HTTP APIへ中継する。
 *
 * ## 説明
 * このプロセスはChrome拡張と直接接続しない。接続状態は常駐daemonが持つ。
 */
export async function runMCP(baseURL: string): Promise<void> {
  const getter = new ProxyDOMGetter(baseURL);
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim() === "") {
        continue;
      }
      await handleLine(getter, line);
    }
  }

  if (buffer.trim() !== "") {
    await handleLine(getter, buffer);
  }
}

// stdioは行区切りJSON-RPCとして読み、id付きrequestだけresponseを返します。
async function handleLine(getter: ProxyDOMGetter, line: string): Promise<void> {
  let request: MCPRequest;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.id === undefined) {
    return;
  }

  const response = await handleRequest(getter, request);
  await Deno.stdout.write(
    new TextEncoder().encode(`${JSON.stringify(response)}\n`),
  );
}

/*
 * # MCP request dispatcher
 *
 * ## 目的
 * AI Agentから来るMCP methodを、tool一覧取得とbrowser tool実行へ振り分ける。
 */
export async function handleRequest(
  getter: BrowserToolRunner,
  request: MCPRequest,
): Promise<MCPResponse> {
  const response: MCPResponse = {
    jsonrpc: "2.0",
    id: request.id,
  };

  switch (request.method) {
    case "initialize":
      response.result = {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "chrome-bridge",
          version: "0.1.0",
        },
      };
      break;
    case "tools/list":
      response.result = {
        tools: MCP_TOOLS,
      };
      break;
    case "tools/call":
      try {
        response.result = await handleToolCall(getter, request.params);
      } catch (error) {
        response.error = {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      break;
    default:
      response.error = {
        code: -32601,
        message: `method not found: ${request.method}`,
      };
  }

  return response;
}

// MCP tool名とargumentsを検証し、transport非依存のbrowser tool実行へ変換します。
async function handleToolCall(
  getter: BrowserToolRunner,
  rawParams: unknown,
): Promise<Record<string, unknown>> {
  const params = rawParams as ToolCallParams;
  if (!params || typeof params.name !== "string") {
    throw new Error("parse tool call params: name is required");
  }

  if (!isKnownToolName(params.name)) {
    throw new Error(`unknown tool: ${params.name}`);
  }

  const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    return textToolResult(
      await callMCPTool(
        getter,
        params.name,
        params.arguments ?? {},
        timeout.signal,
      ),
    );
  } finally {
    timeout.cancel();
  }
}
