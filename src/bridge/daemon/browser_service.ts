import type { BridgeMessage, BrowserToolName } from "../protocol/types.ts";
import { WebSocketBridge } from "./ws_bridge.ts";

function buildRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

// MCP/HTTP層からChrome拡張へbrowser tool commandを送るdaemon側の境界です。
export class BrowserService {
  constructor(private readonly bridge: WebSocketBridge) {}

  async callTool(
    name: BrowserToolName,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await this.bridge.request({
      id: buildRequestId(name.replaceAll("_", "-")),
      type: name,
      payload,
    }, signal);
    if (response.error) {
      throw new Error(`${response.error.code}: ${response.error.message}`);
    }
    return response.payload;
  }
}

// MCPプロセスからdaemonの汎用tool HTTP endpointへ要求を中継します。
export class ProxyBrowserClient {
  constructor(private readonly baseURL: string) {}

  async callTool(
    name: BrowserToolName,
    payload: unknown,
    signal: AbortSignal,
  ): Promise<string> {
    const response = await fetch(`${this.baseURL}/tool/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(body);
    }
    return body;
  }
}

export type BrowserToolResult = BridgeMessage;
