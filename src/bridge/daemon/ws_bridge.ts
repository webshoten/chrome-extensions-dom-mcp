import type { BridgeMessage } from "../protocol/types.ts";

// 1回のbrowser tool実行を、Chrome拡張から返る同じidのresponseへ対応付ける内部状態です。
type PendingResponse = {
  resolve: (message: BridgeMessage) => void;
  reject: (error: Error) => void;
};

/*
 * # Chrome拡張WebSocketブリッジ
 *
 * ## 目的
 * AI Agentから来たbrowser tool実行を、普段使いChrome内の拡張へ届ける通信境界。
 *
 * ## 説明
 * daemonの外側はHTTP/MCP、Chrome拡張との実接続はWebSocketに分ける。
 * 拡張側から張られた接続を保持し、request idでtool requestとresponseを対応付ける。
 */
export class WebSocketBridge {
  // Chrome拡張側から張られた接続集合です。daemonはこの接続を通じてだけChromeへ命令できます。
  #clients = new Set<WebSocket>();

  // Chrome拡張へ送信済みで、まだresponseが戻っていないtool requestを保持します。
  #pending = new Map<string, PendingResponse>();

  // ユーザーやAIへ「拡張が接続済みか」を見せるための状態値です。
  get clientCount(): number {
    return this.#clients.size;
  }

  // Chrome拡張がdaemonへ接続してくる入口です。
  handleWebSocket(request: Request): Response {
    const { socket, response } = Deno.upgradeWebSocket(request);

    this.#clients.add(socket);
    console.error("websocket connected");

    socket.addEventListener("message", (event) => {
      this.#handleMessage(socket, event.data);
    });

    // 切断後の古い接続を送信対象に残さないことで、次のtool実行を正しい接続へ流します。
    socket.addEventListener("close", () => {
      this.#clients.delete(socket);
      console.error("websocket disconnected");
    });

    // errorも切断と同じく、Chromeへ命令できない接続として扱います。
    socket.addEventListener("error", (event) => {
      console.error("websocket error", event);
      this.#clients.delete(socket);
    });

    return response;
  }

  // daemon内のtool実行要求をChrome拡張へ渡し、Chrome側の実行結果に変換します。
  request(message: BridgeMessage, signal: AbortSignal): Promise<BridgeMessage> {
    const clients = [...this.#clients].filter((client) =>
      client.readyState === WebSocket.OPEN
    );
    if (clients.length === 0) {
      return Promise.reject(new Error("chrome extension is not connected"));
    }
    if (!message.id) {
      return Promise.reject(new Error("websocket request id is required"));
    }

    return new Promise((resolve, reject) => {
      const id = message.id as string;

      // tool実行が完了・失敗・timeoutした後に、request待機状態を残さないための共通処理です。
      const cleanup = () => {
        this.#pending.delete(id);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new Error("wait for chrome extension response: timeout"));
      };

      // request idを先に登録して、Chrome拡張からのresponseをこのtool実行へ結び付けます。
      this.#pending.set(id, {
        resolve: (response) => {
          cleanup();
          resolve(response);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      signal.addEventListener("abort", onAbort, { once: true });

      let sent = 0;
      let lastError: Error | undefined;

      // MV3では複数接続が残ることがあるため、同じrequestを接続中の拡張へbroadcastします。
      for (const client of clients) {
        try {
          client.send(JSON.stringify(message));
          sent += 1;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      // どの拡張接続にも届けられない場合は、tool実行自体を失敗として返します。
      if (sent === 0) {
        cleanup();
        reject(lastError ?? new Error("send websocket request failed"));
      }
    });
  }

  // Chrome拡張から戻るmessageを、接続維持messageとtool実行結果に分けます。
  #handleMessage(socket: WebSocket, rawData: unknown): void {
    const rawText = typeof rawData === "string"
      ? rawData
      : new TextDecoder().decode(rawData as ArrayBuffer);

    let message: BridgeMessage;
    try {
      message = JSON.parse(rawText);
    } catch (error) {
      console.error("parse websocket message", error);
      return;
    }

    console.error(`received message type: ${message.type}`);

    // 拡張service workerの生存確認です。tool実行結果ではないためpendingには結び付けません。
    if (message.type === "ping") {
      socket.send(JSON.stringify({ id: message.id, type: "pong" }));
      return;
    }

    if (!message.id) {
      return;
    }

    // request idが一致したmessageだけを、対応するbrowser toolの結果として扱います。
    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    pending.resolve(message);
  }
}
