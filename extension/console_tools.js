(function () {
  /*
   * # Console取得tool
   *
   * ## 目的
   * AI Agentが現在タブのconsole/error/unhandledrejection履歴をデバッグ材料として取得できるようにする。
   *
   * ## 説明
   * background service workerはページのconsoleを直接読めないため、content script側のbufferへ問い合わせる。
   */
  const DEFAULT_LIMIT = 100;
  const MAX_LIMIT = 200;

  function normalizeQuery(rawQuery) {
    const query = rawQuery && typeof rawQuery === "object" ? rawQuery : {};
    let limit = Number.isInteger(query.limit) ? query.limit : DEFAULT_LIMIT;
    limit = Math.min(Math.max(limit, 1), MAX_LIMIT);

    return {
      query: typeof query.query === "string" ? query.query : "",
      levels: Array.isArray(query.levels)
        ? query.levels.filter((level) => typeof level === "string")
        : [],
      limit,
      clear: query.clear === true,
    };
  }

  // content scriptがまだ入っていないタブでは、必要なcapture/hookを後から注入します。
  async function sendConsoleMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (_error) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["console_capture.js"],
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["page_console_hook.js"],
        world: "MAIN",
      });
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  // MCP toolのqueryを現在タブのconsole buffer検索へ変換し、tab meta付きで返します。
  async function getConsole(rawQuery) {
    const tab = await globalThis.BridgeActiveTab.getActiveTab();
    const query = normalizeQuery(rawQuery);
    const result = await sendConsoleMessage(tab.id, {
      type: "chrome_bridge_get_console",
      payload: query,
    });

    return {
      ...globalThis.BridgeActiveTab.tabMeta(tab),
      capturedAt: new Date().toISOString(),
      source: "contentScript",
      query: query.query,
      levels: query.levels,
      totalCount: result.totalCount,
      matchedCount: result.matchedCount,
      returnedCount: result.entries.length,
      entries: result.entries,
    };
  }

  globalThis.BridgeConsoleTools = {
    getConsole,
  };
})();
