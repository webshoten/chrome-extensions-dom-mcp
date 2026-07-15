(function () {
  /*
   * # DOM取得tool
   *
   * ## 目的
   * AI Agentが現在タブのページ構造を読めるように、Chrome拡張側でDOM snapshotを取得する。
   *
   * ## 説明
   * daemon/DenoはDOMへ直接アクセスできないため、Chrome APIで対象タブ内にscriptを実行する。
   */
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
