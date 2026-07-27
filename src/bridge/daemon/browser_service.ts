import type { BridgeMessage, BrowserToolName } from "../protocol/types.ts";
import { WebSocketBridge } from "./ws_bridge.ts";

// WebSocket上でtool request/responseを対応付けるため、tool名を含む一意なidを作ります。
function buildRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

/*
 * # Browser tool実行サービス
 *
 * ## 目的
 * daemon内のHTTP requestを、Chrome拡張上で実行されるbrowser tool requestへ変換する境界。
 *
 * ## 説明
 * daemonはDOMやConsoleを直接読まない。Chrome APIが必要な処理はWebSocket経由で拡張へ渡す。
 */
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

export type BrowserToolResult = BridgeMessage;
