import {
  type BrowserToolRunner,
  callMCPTool,
  isKnownToolName,
  MCP_TOOLS,
} from "./tools.ts";
import type { BrowserToolName, ScreenshotResult } from "../protocol/types.ts";

export type JsonRpcID = string | number | null;

export type MCPRequest = {
  jsonrpc: string;
  id?: JsonRpcID;
  method: string;
  params?: unknown;
};

export type MCPResponse = {
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

function isScreenshotResult(value: unknown): value is ScreenshotResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const result = value as Partial<ScreenshotResult>;
  return (result.mimeType === "image/png" ||
    result.mimeType === "image/jpeg") &&
    typeof result.data === "string" &&
    typeof result.url === "string" &&
    typeof result.title === "string" &&
    typeof result.capturedAt === "string";
}

// ScreenshotだけはMCPのimage contentへ変換し、それ以外は従来通りtextとして返します。
function browserToolResult(
  name: BrowserToolName,
  result: unknown,
): Record<string, unknown> {
  if (name !== "take_screenshot") {
    const text = typeof result === "string" ? result : JSON.stringify(result);
    return textToolResult(text);
  }
  if (!isScreenshotResult(result)) {
    throw new Error("invalid screenshot response from chrome extension");
  }

  const { data, mimeType, ...metadata } = result;
  return {
    content: [
      { type: "image", data, mimeType },
      { type: "text", text: JSON.stringify(metadata) },
    ],
    isError: false,
  };
}

/*
 * # MCP request dispatcher
 *
 * ## 目的
 * Desktop appのHTTP MCP入口から来るmethodを、tool一覧取得とbrowser tool実行へ振り分ける。
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
    return browserToolResult(
      params.name,
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
