import { assertEquals } from "jsr:@std/assert";
import type { BrowserToolName } from "../protocol/types.ts";
import { handleRequest } from "./server.ts";
import type { BrowserToolRunner } from "./tools.ts";

class FakeBrowserGetter implements BrowserToolRunner {
  calls: Array<{ name: BrowserToolName; payload: unknown }> = [];

  constructor(
    private readonly payloads: Partial<Record<BrowserToolName, string>> = {},
  ) {}

  callTool(
    name: BrowserToolName,
    payload: unknown,
    _signal: AbortSignal,
  ): Promise<string> {
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
    "get_dom",
    "get_network",
    "get_console",
    "click",
    "fill",
    "wait_for",
    "navigate",
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
