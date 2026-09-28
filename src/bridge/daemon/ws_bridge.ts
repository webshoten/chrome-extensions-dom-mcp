import type { BridgeMessage } from "../protocol/types.ts";

const ALL_RESPONSES_GRACE_MS = 500;

export type ClientBridgeResponse = {
  clientId: string;
  message: BridgeMessage;
};

// 1回のbrowser tool実行について、各Chrome拡張からのresponseを集約する内部状態です。
type PendingResponse = {
  clients: Set<WebSocket>;
  mode: "first-success" | "all";
  responses: ClientBridgeResponse[];
  settleTimer?: ReturnType<typeof setTimeout>;
  resolve: (responses: ClientBridgeResponse[]) => void;
  reject: (error: Error) => void;
};

type UpgradeWebSocket = (request: Request) => {
  socket: WebSocket;
  response: Response;
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
  #clients = new Map<WebSocket, string>();

  // Chrome拡張へ送信済みで、まだresponseが戻っていないtool requestを保持します。
  #pending = new Map<string, PendingResponse>();

  constructor(
    private readonly upgradeWebSocket: UpgradeWebSocket = (request) =>
      Deno.upgradeWebSocket(request),
  ) {}

  // ユーザーやAIへ「拡張が接続済みか」を見せるための状態値です。
  get clientCount(): number {
    return this.#clients.size;
  }

  // Chrome拡張がdaemonへ接続してくる入口です。
  handleWebSocket(request: Request): Response {
    const { socket, response } = this.upgradeWebSocket(request);
    const clientId = `browser-${crypto.randomUUID()}`;

    this.#clients.set(socket, clientId);
    console.error(`websocket connected: ${clientId}`);

    socket.addEventListener("message", (event) => {
      this.#handleMessage(socket, event.data);
    });

    // 切断後の古い接続を送信対象に残さないことで、次のtool実行を正しい接続へ流します。
    socket.addEventListener("close", () => {
      this.#removeClient(socket);
      console.error(`websocket disconnected: ${clientId}`);
    });

    // errorも切断と同じく、Chromeへ命令できない接続として扱います。
    socket.addEventListener("error", (event) => {
      console.error("websocket error", event);
      this.#removeClient(socket);
    });

    return response;
  }

  // daemon内のtool実行要求をChrome拡張へ渡し、Chrome側の実行結果に変換します。
  async request(
    message: BridgeMessage,
    signal: AbortSignal,
    clientId?: string,
  ): Promise<BridgeMessage> {
    const responses = await this.#request(
      message,
      signal,
      "first-success",
      clientId,
    );
    return responses[0].message;
  }

  // window/tab一覧のように、接続中の全Chrome profileを集約するtoolで使います。
  requestAll(
    message: BridgeMessage,
    signal: AbortSignal,
  ): Promise<ClientBridgeResponse[]> {
    return this.#request(message, signal, "all");
  }

  #request(
    message: BridgeMessage,
    signal: AbortSignal,
    mode: PendingResponse["mode"],
    targetClientId?: string,
  ): Promise<ClientBridgeResponse[]> {
    const clients = [...this.#clients.entries()]
      .filter(([client, clientId]) =>
        client.readyState === WebSocket.OPEN &&
        (targetClientId === undefined || clientId === targetClientId)
      )
      .map(([client]) => client);
    if (clients.length === 0) {
      const message = targetClientId === undefined
        ? "chrome extension is not connected"
        : "browser target is no longer connected; call list_tabs again";
      return Promise.reject(new Error(message));
    }
    if (!message.id) {
      return Promise.reject(new Error("websocket request id is required"));
    }

    return new Promise((resolve, reject) => {
      const id = message.id as string;
      const pendingClients = new Set(clients);

      // tool実行が完了・失敗・timeoutした後に、request待機状態を残さないための共通処理です。
      const cleanup = () => {
        this.#pending.delete(id);
        signal.removeEventListener("abort", onAbort);
        if (pending.settleTimer !== undefined) {
          clearTimeout(pending.settleTimer);
        }
      };
      const onAbort = () => {
        cleanup();
        reject(new Error("wait for chrome extension response: timeout"));
      };

      // request idを先に登録して、Chrome拡張からのresponseをこのtool実行へ結び付けます。
      const pending: PendingResponse = {
        clients: pendingClients,
        mode,
        responses: [],
        resolve: (response) => {
          cleanup();
          resolve(response);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };
      this.#pending.set(id, pending);
      signal.addEventListener("abort", onAbort, { once: true });

      let sent = 0;
      let lastError: Error | undefined;

      // 一部のprofileや古い接続が失敗しても成功を採用できるよう、全接続へ送ります。
      for (const client of clients) {
        try {
          client.send(JSON.stringify(message));
          sent += 1;
        } catch (error) {
          pendingClients.delete(client);
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

    const errorDetail = message.error
      ? ` (${message.error.code}: ${message.error.message})`
      : "";
    console.error(`received message type: ${message.type}${errorDetail}`);

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
    if (!pending.clients.delete(socket)) {
      return;
    }

    const clientId = this.#clients.get(socket);
    if (!clientId) {
      return;
    }
    const response = { clientId, message };
    pending.responses.push(response);

    // 通常toolは最初の成功を採用し、一覧toolは全profileの応答を待って集約します。
    if (pending.mode === "first-success" && !message.error) {
      pending.resolve([response]);
      return;
    }
    if (pending.mode === "all" && pending.clients.size > 0) {
      // 古い拡張が未知のtoolへ応答しなくても、応答済みprofileの一覧を返せるよう短時間だけ待ちます。
      pending.settleTimer ??= setTimeout(
        () => pending.resolve(pending.responses),
        ALL_RESPONSES_GRACE_MS,
      );
      return;
    }
    if (pending.clients.size > 0) {
      return;
    }

    const responses = pending.mode === "first-success"
      ? [pending.responses[0]]
      : pending.responses;
    pending.resolve(responses);
  }

  #removeClient(socket: WebSocket): void {
    this.#clients.delete(socket);

    for (const pending of this.#pending.values()) {
      if (!pending.clients.delete(socket) || pending.clients.size > 0) {
        continue;
      }
      if (pending.responses.length > 0) {
        const responses = pending.mode === "first-success"
          ? [pending.responses[0]]
          : pending.responses;
        pending.resolve(responses);
        continue;
      }
      pending.reject(
        new Error("chrome extension disconnected before response"),
      );
    }
  }
}
