import type { BridgeMessage } from "../protocol/types.ts";

type PendingResponse = {
  resolve: (message: BridgeMessage) => void;
  reject: (error: Error) => void;
};

export class WebSocketBridge {
  #clients = new Set<WebSocket>();
  #pending = new Map<string, PendingResponse>();

  get clientCount(): number {
    return this.#clients.size;
  }

  handleWebSocket(request: Request): Response {
    const { socket, response } = Deno.upgradeWebSocket(request);

    this.#clients.add(socket);
    console.error("websocket connected");

    socket.addEventListener("message", (event) => {
      this.#handleMessage(socket, event.data);
    });
    socket.addEventListener("close", () => {
      this.#clients.delete(socket);
      console.error("websocket disconnected");
    });
    socket.addEventListener("error", (event) => {
      console.error("websocket error", event);
      this.#clients.delete(socket);
    });

    return response;
  }

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
      const cleanup = () => {
        this.#pending.delete(id);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new Error("wait for chrome extension response: timeout"));
      };

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
      for (const client of clients) {
        try {
          client.send(JSON.stringify(message));
          sent += 1;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      if (sent === 0) {
        cleanup();
        reject(lastError ?? new Error("send websocket request failed"));
      }
    });
  }

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
    if (message.type === "ping") {
      socket.send(JSON.stringify({ id: message.id, type: "pong" }));
      return;
    }

    if (!message.id) {
      return;
    }

    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    pending.resolve(message);
  }
}
