(function () {
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
