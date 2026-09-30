import { assert, assertEquals, assertRejects } from "jsr:@std/assert";

type DebuggerCommand = {
  method: string;
  params: Record<string, unknown>;
};

type DragTools = {
  drag: (input: unknown) => Promise<Record<string, unknown>>;
};

Deno.test("drag sends CDP input and always detaches", async () => {
  const testGlobal = globalThis as typeof globalThis & {
    chrome?: unknown;
    BridgeActiveTab?: unknown;
    BridgeDragTools?: DragTools;
  };
  const originalChrome = testGlobal.chrome;
  const originalActiveTab = testGlobal.BridgeActiveTab;
  const originalDragTools = testGlobal.BridgeDragTools;
  const commands: DebuggerCommand[] = [];
  const attachments: Array<{ tabId: number; version: string }> = [];
  const detachments: Array<{ tabId: number }> = [];
  let failMousePress = false;

  try {
    testGlobal.BridgeActiveTab = {
      getTargetTab(tabId: number) {
        return Promise.resolve({
          id: tabId,
          url: "https://example.com/board",
          title: "Board",
        });
      },
      tabMeta(tab: { id: number; url: string; title: string }) {
        return { tabId: tab.id, url: tab.url, title: tab.title };
      },
    };
    testGlobal.chrome = {
      scripting: {
        executeScript() {
          return Promise.resolve([{
            result: {
              source: {
                x: 10,
                y: 20,
                element: { tagName: "div", id: "from" },
              },
              destination: {
                x: 110,
                y: 120,
                element: { tagName: "div", id: "to" },
              },
            },
          }]);
        },
      },
      debugger: {
        attach(debuggee: { tabId: number }, version: string) {
          attachments.push({ tabId: debuggee.tabId, version });
          return Promise.resolve();
        },
        sendCommand(
          _debuggee: { tabId: number },
          method: string,
          params: Record<string, unknown>,
        ) {
          commands.push({ method, params });
          if (
            failMousePress && method === "Input.dispatchMouseEvent" &&
            params.type === "mousePressed"
          ) {
            return Promise.reject(new Error("injected mouse failure"));
          }
          return Promise.resolve();
        },
        detach(debuggee: { tabId: number }) {
          detachments.push(debuggee);
          return Promise.resolve();
        },
      },
    };

    await import("./drag_tools.js");
    const input = {
      tabId: 42,
      source: { selector: "#from" },
      destination: { selector: "#to" },
      modifiers: ["Shift"],
      durationMs: 0,
      steps: 2,
    };
    const result = await testGlobal.BridgeDragTools?.drag(input);

    assert(result);
    assertEquals(attachments, [{ tabId: 42, version: "1.3" }]);
    assertEquals(detachments, [{ tabId: 42 }]);
    assertEquals(result.eventMode, "cdp");
    assertEquals(result.modifiers, ["Shift"]);
    assertEquals(
      commands.filter((command) =>
        command.method === "Input.dispatchMouseEvent"
      ).map((command) => command.params.type),
      [
        "mouseMoved",
        "mousePressed",
        "mouseMoved",
        "mouseMoved",
        "mouseReleased",
      ],
    );
    assertEquals(
      commands.filter((command) =>
        command.method === "Input.dispatchMouseEvent"
      ).map((command) => command.params.modifiers),
      [8, 8, 8, 8, 8],
    );

    commands.length = 0;
    failMousePress = true;
    await assertRejects(
      () => testGlobal.BridgeDragTools!.drag(input),
      Error,
      "CDP drag failed: injected mouse failure",
    );
    assertEquals(detachments, [{ tabId: 42 }, { tabId: 42 }]);
  } finally {
    testGlobal.chrome = originalChrome;
    testGlobal.BridgeActiveTab = originalActiveTab;
    testGlobal.BridgeDragTools = originalDragTools;
  }
});
