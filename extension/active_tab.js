(function () {
  /*
   * # Browser tab選択境界
   *
   * ## 目的
   * 各browser toolが、現在タブまたは一覧から明示されたタブを共通の方法で選べるようにする。
   *
   * ## 説明
   * service workerではcurrent windowが存在しない場合があるため、通常ウィンドウのactive tabから対象を選ぶ。
   */
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({
      active: true,
      windowType: "normal",
    });
    const availableTabs = tabs.filter((tab) => tab.id !== undefined);

    if (availableTabs.length === 0) {
      throw new Error(
        `active tab was not found (normalTabs=${tabs.length}, usableTabs=${availableTabs.length})`,
      );
    }
    if (availableTabs.length === 1) {
      return availableTabs[0];
    }

    try {
      const browserWindow = await chrome.windows.getLastFocused({
        windowTypes: ["normal"],
      });
      return availableTabs.find((tab) => tab.windowId === browserWindow.id) ??
        availableTabs[0];
    } catch (_error) {
      return availableTabs[0];
    }
  }

  async function getTargetTab(tabId) {
    if (tabId === undefined) {
      return await getActiveTab();
    }
    if (!Number.isInteger(tabId) || tabId < 0) {
      throw new Error("tabId must be a non-negative integer");
    }

    const tab = await chrome.tabs.get(tabId);
    if (tab.id === undefined) {
      throw new Error(`tab was not found: ${tabId}`);
    }
    return tab;
  }

  async function listTabs() {
    const windows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ["normal"],
    });

    return {
      windows: windows.map((browserWindow) => ({
        windowId: browserWindow.id,
        focused: browserWindow.focused,
        incognito: browserWindow.incognito,
        type: browserWindow.type,
        tabs: (browserWindow.tabs ?? []).flatMap((tab) =>
          tab.id === undefined ? [] : [{
            tabId: tab.id,
            active: tab.active,
            pinned: tab.pinned,
            url: tab.url || "",
            title: tab.title || "",
          }]
        ),
      })),
    };
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
    getTargetTab,
    listTabs,
    tabMeta,
  };
})();
