import { assertEquals } from "jsr:@std/assert";
import type { BrowserToolName } from "../protocol/types.ts";
import { handleRequest } from "./server.ts";
import type { BrowserToolRunner } from "./tools.ts";
import { MCPHttpTransport } from "./http_transport.ts";

class FakeBrowserGetter implements BrowserToolRunner {
  calls: Array<{ name: BrowserToolName; payload: unknown }> = [];

  constructor(
    private readonly payloads: Partial<Record<BrowserToolName, unknown>> = {},
  ) {}

  callTool(
    name: BrowserToolName,
    payload: unknown,
    _signal: AbortSignal,
  ): Promise<unknown> {
    this.calls.push({ name, payload });
    return Promise.resolve(this.payloads[name] ?? `{"ok":true}`);
  }
}

Deno.test("handleRequest lists tools", async () => {
  const response = await handleRequest(new FakeBrowserGetter(), {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });

  const result = response.result as {
    tools: Array<{ name: string }>;
  };
  assertEquals(response.error, undefined);
  assertEquals(result.tools.map((tool) => tool.name), [
    "list_tabs",
    "get_dom",
    "get_network",
    "get_console",
    "click",
    "fill",
    "wait_for",
    "navigate",
    "take_screenshot",
  ]);
});

Deno.test("handleRequest calls get_dom tool", async () => {
  const getter = new FakeBrowserGetter({
    get_dom: `{"html":"<html></html>"}`,
  });
  const response = await handleRequest(getter, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "get_dom",
      arguments: {},
    },
  });

  const result = response.result as {
    content: Array<{ text: string }>;
  };
  assertEquals(response.error, undefined);
  assertEquals(getter.calls, [{ name: "get_dom", payload: {} }]);
  assertEquals(result.content[0].text, `{"html":"<html></html>"}`);
});

Deno.test("handleRequest passes get_dom targetId to the browser runner", async () => {
  const getter = new FakeBrowserGetter({
    get_dom: `{"html":"<html></html>"}`,
  });
  const response = await handleRequest(getter, {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "get_dom",
      arguments: {
        targetId: "page:browser-example:42",
      },
    },
  });

  assertEquals(response.error, undefined);
  assertEquals(getter.calls, [{
    name: "get_dom",
    payload: { targetId: "page:browser-example:42" },
  }]);
});

Deno.test("handleRequest calls get_network tool", async () => {
  const getter = new FakeBrowserGetter({
    get_network: `{"source":"webRequest","entries":[]}`,
  });
  const response = await handleRequest(getter, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "get_network",
      arguments: {
        query: "/api/patients",
        failedOnly: true,
        limit: 25,
      },
    },
  });

  const result = response.result as {
    content: Array<{ text: string }>;
  };
  assertEquals(response.error, undefined);
  assertEquals(getter.calls, [{
    name: "get_network",
    payload: {
      query: "/api/patients",
      failedOnly: true,
      limit: 25,
    },
  }]);
  assertEquals(result.content[0].text, `{"source":"webRequest","entries":[]}`);
});

Deno.test("handleRequest calls click tool", async () => {
  const getter = new FakeBrowserGetter({
    click: `{"action":"click","ok":true}`,
  });
  const response = await handleRequest(getter, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "click",
      arguments: {
        selector: "button[type=submit]",
      },
    },
  });

  const result = response.result as {
    content: Array<{ text: string }>;
  };
  assertEquals(response.error, undefined);
  assertEquals(getter.calls, [{
    name: "click",
    payload: {
      selector: "button[type=submit]",
    },
  }]);
  assertEquals(result.content[0].text, `{"action":"click","ok":true}`);
});

Deno.test("handleRequest returns screenshot as MCP image content", async () => {
  const getter = new FakeBrowserGetter({
    take_screenshot: {
      tabId: 42,
      url: "https://example.com",
      title: "Example",
      capturedAt: "2026-07-27T00:00:00.000Z",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
    },
  });
  const response = await handleRequest(getter, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "take_screenshot",
      arguments: { format: "png" },
    },
  });

  const result = response.result as {
    content: Array<Record<string, unknown>>;
  };
  assertEquals(response.error, undefined);
  assertEquals(getter.calls, [{
    name: "take_screenshot",
    payload: { format: "png" },
  }]);
  assertEquals(result.content, [
    {
      type: "image",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
    },
    {
      type: "text",
      text: JSON.stringify({
        tabId: 42,
        url: "https://example.com",
        title: "Example",
        capturedAt: "2026-07-27T00:00:00.000Z",
      }),
    },
  ]);
});

Deno.test("MCP HTTP transport initializes without a CLI process", async () => {
  const transport = new MCPHttpTransport(new FakeBrowserGetter());
  const response = await transport.handleRequest(
    new Request(
      "http://127.0.0.1:9333/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
        }),
      },
    ),
  );

  const payload = await response.json();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(payload.id, 10);
  assertEquals(payload.result.serverInfo.name, "chrome-bridge");
});

Deno.test("MCP HTTP transport accepts initialized notification", async () => {
  const transport = new MCPHttpTransport(new FakeBrowserGetter());
  const response = await transport.handleRequest(
    new Request(
      "http://127.0.0.1:9333/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      },
    ),
  );

  assertEquals(response.status, 202);
  assertEquals(await response.text(), "");
});
