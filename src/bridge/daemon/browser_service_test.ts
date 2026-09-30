import { assertEquals, assertRejects } from "jsr:@std/assert";
import type { BridgeMessage } from "../protocol/types.ts";
import { BrowserService } from "./browser_service.ts";
import type { ClientBridgeResponse } from "./ws_bridge.ts";

class FakeBridge {
  requests: Array<{
    message: BridgeMessage;
    clientId?: string;
  }> = [];

  request(
    message: BridgeMessage,
    _signal: AbortSignal,
    clientId?: string,
  ): Promise<BridgeMessage> {
    this.requests.push({ message, clientId });
    return Promise.resolve({
      id: message.id,
      type: `${message.type}_result`,
      payload: { html: "<html></html>" },
    });
  }

  requestAll(
    _message: BridgeMessage,
    _signal: AbortSignal,
  ): Promise<ClientBridgeResponse[]> {
    return Promise.resolve([
      {
        clientId: "browser-first",
        message: {
          type: "list_tabs_result",
          payload: {
            windows: [{
              windowId: 1,
              focused: false,
              incognito: false,
              type: "normal",
              tabs: [{
                tabId: 11,
                active: true,
                pinned: false,
                url: "https://first.example/",
                title: "First",
              }],
            }],
          },
        },
      },
      {
        clientId: "browser-second",
        message: {
          type: "list_tabs_result",
          payload: {
            windows: [{
              windowId: 2,
              focused: true,
              incognito: false,
              type: "normal",
              tabs: [{
                tabId: 22,
                active: true,
                pinned: true,
                url: "https://second.example/",
                title: "Second",
              }],
            }],
          },
        },
      },
    ]);
  }
}

Deno.test("BrowserService lists tabs with routable target IDs", async () => {
  const bridge = new FakeBridge();
  const service = new BrowserService(bridge);
  const result = await service.callTool(
    "list_tabs",
    {},
    new AbortController().signal,
  ) as {
    windows: Array<{
      browserId: string;
      focused: boolean;
      tabs: Array<{ targetId: string }>;
    }>;
  };

  assertEquals(
    result.windows.map((window) => ({
      browserId: window.browserId,
      focused: window.focused,
      targetId: window.tabs[0].targetId,
    })),
    [
      {
        browserId: "browser-second",
        focused: true,
        targetId: "page:browser-second:22",
      },
      {
        browserId: "browser-first",
        focused: false,
        targetId: "page:browser-first:11",
      },
    ],
  );
});

Deno.test("BrowserService routes get_dom to the target connection and tab", async () => {
  const bridge = new FakeBridge();
  const service = new BrowserService(bridge);
  await service.callTool(
    "get_dom",
    { targetId: "page:browser-second:22" },
    new AbortController().signal,
  );

  assertEquals(bridge.requests.length, 1);
  assertEquals(bridge.requests[0].clientId, "browser-second");
  assertEquals(bridge.requests[0].message.type, "get_dom");
  assertEquals(bridge.requests[0].message.payload, { tabId: 22 });
});

Deno.test("BrowserService routes pointer actions to one connection and tab", async () => {
  const bridge = new FakeBridge();
  const service = new BrowserService(bridge);
  await service.callTool(
    "drag",
    {
      targetId: "page:browser-second:22",
      source: { x: 10, y: 20 },
      destination: { x: 30, y: 40 },
      modifiers: ["Shift"],
    },
    new AbortController().signal,
  );
  await service.callTool(
    "double_click",
    {
      targetId: "page:browser-second:22",
      selector: "[data-test='item']",
    },
    new AbortController().signal,
  );

  assertEquals(
    bridge.requests.map((request) => ({
      clientId: request.clientId,
      type: request.message.type,
      payload: request.message.payload,
    })),
    [
      {
        clientId: "browser-second",
        type: "drag",
        payload: {
          source: { x: 10, y: 20 },
          destination: { x: 30, y: 40 },
          modifiers: ["Shift"],
          tabId: 22,
        },
      },
      {
        clientId: "browser-second",
        type: "double_click",
        payload: {
          selector: "[data-test='item']",
          tabId: 22,
        },
      },
    ],
  );
});

Deno.test("BrowserService rejects malformed target IDs", async () => {
  const service = new BrowserService(new FakeBridge());
  await assertRejects(
    () =>
      service.callTool(
        "get_dom",
        { targetId: "not-a-target" },
        new AbortController().signal,
      ),
    Error,
    "invalid targetId",
  );
});

Deno.test("BrowserService requires target IDs for pointer actions", async () => {
  const service = new BrowserService(new FakeBridge());
  for (const name of ["double_click", "drag"] as const) {
    await assertRejects(
      () =>
        service.callTool(
          name,
          name === "drag"
            ? {
              source: { x: 10, y: 20 },
              destination: { x: 30, y: 40 },
            }
            : { x: 10, y: 20 },
          new AbortController().signal,
        ),
      Error,
      `targetId is required for ${name}`,
    );
  }
});
