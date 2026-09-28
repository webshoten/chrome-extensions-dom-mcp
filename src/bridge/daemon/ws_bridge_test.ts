import { assertEquals } from "jsr:@std/assert";
import type { BridgeMessage } from "../protocol/types.ts";
import { WebSocketBridge } from "./ws_bridge.ts";

class FakeWebSocket extends EventTarget {
  readyState = WebSocket.OPEN;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  receive(message: BridgeMessage): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }
}

function createBridge(sockets: FakeWebSocket[]): WebSocketBridge {
  let nextSocket = 0;
  const bridge = new WebSocketBridge(() => ({
    socket: sockets[nextSocket++] as unknown as WebSocket,
    response: new Response(null),
  }));

  for (const _socket of sockets) {
    bridge.handleWebSocket(new Request("http://127.0.0.1:9333/ws"));
  }
  return bridge;
}

Deno.test("WebSocketBridge prefers a successful response over an earlier error", async () => {
  const failedSocket = new FakeWebSocket();
  const successfulSocket = new FakeWebSocket();
  const bridge = createBridge([failedSocket, successfulSocket]);
  const response = bridge.request(
    { id: "request-1", type: "get_dom", payload: {} },
    new AbortController().signal,
  );

  assertEquals(failedSocket.sent.length, 1);
  assertEquals(successfulSocket.sent.length, 1);

  failedSocket.receive({
    id: "request-1",
    type: "error",
    error: {
      code: "GET_DOM_FAILED",
      message: "active tab was not found",
    },
  });
  successfulSocket.receive({
    id: "request-1",
    type: "get_dom_result",
    payload: { html: "<html></html>" },
  });

  assertEquals(await response, {
    id: "request-1",
    type: "get_dom_result",
    payload: { html: "<html></html>" },
  });
});

Deno.test("WebSocketBridge returns an error after every connection fails", async () => {
  const firstSocket = new FakeWebSocket();
  const secondSocket = new FakeWebSocket();
  const bridge = createBridge([firstSocket, secondSocket]);
  const response = bridge.request(
    { id: "request-2", type: "get_dom", payload: {} },
    new AbortController().signal,
  );
  const firstError: BridgeMessage = {
    id: "request-2",
    type: "error",
    error: {
      code: "GET_DOM_FAILED",
      message: "active tab was not found",
    },
  };

  firstSocket.receive(firstError);
  secondSocket.receive({
    id: "request-2",
    type: "error",
    error: {
      code: "GET_DOM_FAILED",
      message: "another profile has no active tab",
    },
  });

  assertEquals(await response, firstError);
});

Deno.test("WebSocketBridge aggregates responses and routes a selected target", async () => {
  const firstSocket = new FakeWebSocket();
  const secondSocket = new FakeWebSocket();
  const bridge = createBridge([firstSocket, secondSocket]);
  const listResponse = bridge.requestAll(
    { id: "list-1", type: "list_tabs", payload: {} },
    new AbortController().signal,
  );

  firstSocket.receive({
    id: "list-1",
    type: "list_tabs_result",
    payload: { windows: [{ windowId: 1, tabs: [] }] },
  });
  secondSocket.receive({
    id: "list-1",
    type: "list_tabs_result",
    payload: { windows: [{ windowId: 2, tabs: [] }] },
  });
  const listed = await listResponse;
  assertEquals(listed.length, 2);

  const targetClientId = listed[1].clientId;
  const targetResponse = bridge.request(
    { id: "target-1", type: "get_dom", payload: { tabId: 42 } },
    new AbortController().signal,
    targetClientId,
  );
  assertEquals(firstSocket.sent.length, 1);
  assertEquals(secondSocket.sent.length, 2);

  secondSocket.receive({
    id: "target-1",
    type: "get_dom_result",
    payload: { html: "<html>target</html>" },
  });
  assertEquals(await targetResponse, {
    id: "target-1",
    type: "get_dom_result",
    payload: { html: "<html>target</html>" },
  });
});
