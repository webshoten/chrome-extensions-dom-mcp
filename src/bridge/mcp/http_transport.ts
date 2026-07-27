import type { BrowserToolRunner } from "./tools.ts";
import { handleRequest, type MCPRequest, type MCPResponse } from "./server.ts";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function errorResponse(
  id: MCPRequest["id"],
  code: number,
  message: string,
  status: number,
): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  }, status);
}

function isMCPRequest(value: unknown): value is MCPRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const request = value as Partial<MCPRequest>;
  return request.jsonrpc === "2.0" && typeof request.method === "string";
}

/*
 * # Streamable HTTP MCP transport
 *
 * ## 目的
 * Desktop appを起動中のCodex/Claudeから、CLIプロセスを介さずbrowser toolを利用できるMCP入口を提供する。
 *
 * ## 説明
 * server-initiated notificationを使わないstateless構成のため、POSTごとにJSON-RPC responseを返す。
 */
export class MCPHttpTransport {
  constructor(private readonly runner: BrowserToolRunner) {}

  async handleRequest(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return errorResponse(null, -32700, "parse error", 400);
    }

    if (Array.isArray(payload)) {
      if (payload.length === 0 || !payload.every(isMCPRequest)) {
        return errorResponse(null, -32600, "invalid request", 400);
      }
      return await this.#handleBatch(payload);
    }
    if (!isMCPRequest(payload)) {
      return errorResponse(null, -32600, "invalid request", 400);
    }

    if (payload.id === undefined) {
      return new Response(null, { status: 202 });
    }
    return jsonResponse(await handleRequest(this.runner, payload));
  }

  async #handleBatch(requests: MCPRequest[]): Promise<Response> {
    const responses: MCPResponse[] = [];
    for (const request of requests) {
      if (request.id !== undefined) {
        responses.push(await handleRequest(this.runner, request));
      }
    }
    return responses.length === 0
      ? new Response(null, { status: 202 })
      : jsonResponse(responses);
  }
}
