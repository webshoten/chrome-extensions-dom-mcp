(function () {
  /*
   * # Active tab境界
   *
   * ## 目的
   * 各browser toolが共通して「普段使いChromeの現在タブ」を対象にできるようにする。
   */
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tabs.length === 0 || tabs[0].id === undefined) {
      throw new Error("active tab was not found");
    }

    return tabs[0];
  }

  // tool結果に共通して載せる、ユーザーが見ているタブの最小メタ情報です。
  function tabMeta(tab) {
    return {
      tabId: tab.id,
      url: tab.url || "",
      title: tab.title || "",
    };
  }

  globalThis.BridgeActiveTab = {
    getActiveTab,
    tabMeta,
  };
})();
