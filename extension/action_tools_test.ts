import { assert, assertEquals } from "jsr:@std/assert";

type PageCommand = {
  name: string;
  input: unknown;
};

type ScriptOptions = {
  target: { tabId: number };
  func: (...args: unknown[]) => unknown;
  args: [PageCommand];
};

type ActionTools = {
  doubleClick: (input: unknown) => Promise<Record<string, unknown>>;
};

Deno.test("double-click sends its location and modifiers to the target tab", async () => {
  const testGlobal = globalThis as typeof globalThis & {
    chrome?: unknown;
    BridgeActiveTab?: unknown;
    BridgeActionTools?: ActionTools;
  };
  const originalChrome = testGlobal.chrome;
  const originalActiveTab = testGlobal.BridgeActiveTab;
  const originalActionTools = testGlobal.BridgeActionTools;
  let receivedOptions: ScriptOptions | undefined;
  let receivedTabId: number | undefined;

  try {
    testGlobal.BridgeActiveTab = {
      getActiveTab() {
        return Promise.resolve({
          id: 42,
          url: "https://example.com/board",
          title: "Board",
        });
      },
      getTargetTab(tabId?: number) {
        receivedTabId = tabId;
        return Promise.resolve({
          id: tabId ?? 42,
          url: "https://example.com/board",
          title: "Board",
        });
      },
      tabMeta(tab: { id: number; url: string; title: string }) {
        return {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
        };
      },
    };
    testGlobal.chrome = {
      scripting: {
        executeScript(options: ScriptOptions) {
          receivedOptions = options;
          const command = options.args[0];
          return Promise.resolve([{
            result: {
              action: command.name,
              ok: true,
              modifiers: ["Meta"],
            },
          }]);
        },
      },
    };

    await import("./action_tools.js");
    const doubleClickInput = {
      x: 480,
      y: 260,
      modifiers: ["Meta"],
      intervalMs: 80,
      tabId: 42,
    };
    const doubleClickResult = await testGlobal.BridgeActionTools?.doubleClick(
      doubleClickInput,
    );
    assert(receivedOptions);
    assertEquals(receivedTabId, 42);
    assertEquals(receivedOptions.target, { tabId: 42 });
    assertEquals(receivedOptions.args, [{
      name: "double_click",
      input: {
        x: 480,
        y: 260,
        modifiers: ["Meta"],
        intervalMs: 80,
      },
    }]);
    assertEquals(doubleClickResult, {
      tabId: 42,
      url: "https://example.com/board",
      title: "Board",
      action: "double_click",
      ok: true,
      modifiers: ["Meta"],
    });
  } finally {
    testGlobal.chrome = originalChrome;
    testGlobal.BridgeActiveTab = originalActiveTab;
    testGlobal.BridgeActionTools = originalActionTools;
  }
});
