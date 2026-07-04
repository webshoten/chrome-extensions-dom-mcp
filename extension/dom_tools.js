(function () {
  async function captureDOM() {
    const tab = await globalThis.BridgeActiveTab.getActiveTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        url: location.href,
        title: document.title,
        capturedAt: new Date().toISOString(),
        html: document.documentElement.outerHTML,
      }),
    });

    if (results.length === 0 || results[0].result === undefined) {
      throw new Error("dom capture returned no result");
    }

    return results[0].result;
  }

  globalThis.BridgeDomTools = {
    captureDOM,
  };
})();
