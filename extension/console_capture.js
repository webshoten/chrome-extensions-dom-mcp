(function () {
  const EVENT_NAME = "chrome-bridge-console-entry";
  const MAX_ENTRIES = 500;

  if (globalThis.__chromeBridgeConsoleCaptureInstalled) {
    return;
  }
  globalThis.__chromeBridgeConsoleCaptureInstalled = true;
  globalThis.__chromeBridgeConsoleEntries =
    globalThis.__chromeBridgeConsoleEntries || [];

  function pushEntry(entry) {
    globalThis.__chromeBridgeConsoleEntries.push(entry);
    while (globalThis.__chromeBridgeConsoleEntries.length > MAX_ENTRIES) {
      globalThis.__chromeBridgeConsoleEntries.shift();
    }
  }

  function normalizeQuery(rawQuery) {
    const query = rawQuery && typeof rawQuery === "object" ? rawQuery : {};
    return {
      query: typeof query.query === "string" ? query.query.toLowerCase() : "",
      levels: Array.isArray(query.levels)
        ? new Set(query.levels.filter((level) => typeof level === "string"))
        : new Set(),
      limit: Number.isInteger(query.limit) ? query.limit : 100,
      clear: query.clear === true,
    };
  }

  window.addEventListener(EVENT_NAME, (event) => {
    if (!event || !event.detail) {
      return;
    }
    try {
      pushEntry(JSON.parse(event.detail));
    } catch (_error) {
      pushEntry({
        level: "error",
        text: "failed to parse console capture event",
        values: [],
        timestamp: new Date().toISOString(),
        url: location.href,
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type === "chrome_bridge_console_ping") {
      sendResponse({ ok: true });
      return true;
    }
    if (message.type !== "chrome_bridge_get_console") {
      return false;
    }

    const query = normalizeQuery(message.payload);
    const allEntries = globalThis.__chromeBridgeConsoleEntries;
    const matched = allEntries.filter((entry) => {
      if (query.levels.size > 0 && !query.levels.has(entry.level)) {
        return false;
      }
      if (query.query !== "") {
        const text = String(entry.text || "").toLowerCase();
        if (!text.includes(query.query)) {
          return false;
        }
      }
      return true;
    });
    const entries = matched.slice(-query.limit).reverse();

    if (query.clear) {
      globalThis.__chromeBridgeConsoleEntries = [];
    }

    sendResponse({
      totalCount: allEntries.length,
      matchedCount: matched.length,
      entries,
    });
    return true;
  });
})();
