import { assertEquals, assertRejects } from "jsr:@std/assert";

type TestTab = {
  id?: number;
  active: boolean;
  windowId: number;
  pinned?: boolean;
  url?: string;
  title?: string;
};

type ActiveTabTools = {
  getActiveTab: () => Promise<TestTab>;
  getTargetTab: (tabId?: number) => Promise<TestTab>;
  listTabs: () => Promise<unknown>;
};

Deno.test("getActiveTab selects the active tab from the last focused normal window", async () => {
  let tabs: TestTab[] = [];
  let receivedTabOptions: unknown;
  let receivedWindowOptions: unknown;
  const testGlobal = globalThis as typeof globalThis & {
    chrome?: unknown;
    BridgeActiveTab?: ActiveTabTools;
  };
  const originalChrome = testGlobal.chrome;
  const originalTools = testGlobal.BridgeActiveTab;

  try {
    testGlobal.chrome = {
      tabs: {
        query(options: unknown) {
          receivedTabOptions = options;
          return Promise.resolve(tabs);
        },
        get(tabId: number) {
          return Promise.resolve(tabs.find((tab) => tab.id === tabId));
        },
      },
      windows: {
        getLastFocused(options: unknown) {
          receivedWindowOptions = options;
          return Promise.resolve({ id: 2 });
        },
        getAll() {
          return Promise.resolve([{
            id: 2,
            focused: true,
            incognito: false,
            type: "normal",
            tabs,
          }]);
        },
      },
    };
    await import("./active_tab.js");

    tabs = [
      { id: 10, active: true, windowId: 1 },
      {
        id: 20,
        active: true,
        windowId: 2,
        url: "https://example.com",
      },
    ];
    const tools = testGlobal.BridgeActiveTab as ActiveTabTools;
    assertEquals(await tools.getActiveTab(), tabs[1]);
    assertEquals(receivedTabOptions, {
      active: true,
      windowType: "normal",
    });
    assertEquals(receivedWindowOptions, {
      windowTypes: ["normal"],
    });
    assertEquals(await tools.getTargetTab(10), tabs[0]);
    assertEquals(await tools.listTabs(), {
      windows: [{
        windowId: 2,
        focused: true,
        incognito: false,
        type: "normal",
        tabs: [{
          tabId: 10,
          active: true,
          pinned: undefined,
          url: "",
          title: "",
        }, {
          tabId: 20,
          active: true,
          pinned: undefined,
          url: "https://example.com",
          title: "",
        }],
      }],
    });

    tabs = [];
    await assertRejects(
      () => tools.getActiveTab(),
      Error,
      "active tab was not found",
    );
  } finally {
    testGlobal.chrome = originalChrome;
    testGlobal.BridgeActiveTab = originalTools;
  }
});
