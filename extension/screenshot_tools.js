(function () {
  /*
   * # Screenshot tool
   *
   * ## 目的
   * ユーザーが現在見ているChromeタブの表示範囲を撮影し、AI Agentへ画像として返す。
   */
  function normalizeInput(input) {
    const format = input?.format ?? "png";
    if (format !== "png" && format !== "jpeg") {
      throw new Error("format must be png or jpeg");
    }

    const quality = input?.quality ?? 90;
    if (
      !Number.isInteger(quality) ||
      quality < 1 ||
      quality > 100
    ) {
      throw new Error("quality must be an integer between 1 and 100");
    }

    return { format, quality };
  }

  // captureVisibleTabはアクティブタブのviewportだけを撮影します。ページ全体の撮影は対象外です。
  async function takeScreenshot(input) {
    const options = normalizeInput(input);
    const tab = await globalThis.BridgeActiveTab.getActiveTab();
    const captureOptions = { format: options.format };
    if (options.format === "jpeg") {
      captureOptions.quality = options.quality;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(
      tab.windowId,
      captureOptions,
    );
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(dataUrl);
    if (!match) {
      throw new Error("Chrome returned an unsupported screenshot format");
    }

    return {
      ...globalThis.BridgeActiveTab.tabMeta(tab),
      capturedAt: new Date().toISOString(),
      mimeType: match[1],
      data: match[2],
    };
  }

  globalThis.BridgeScreenshotTools = {
    takeScreenshot,
  };
})();
