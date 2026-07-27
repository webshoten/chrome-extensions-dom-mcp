# take_screenshot

[設計書トップへ戻る](../../DESIGN.md)

## 目的

`take_screenshot`は、AIが現在のChromeタブを視覚的に確認できるように、ユーザーが見ている表示範囲を画像として返す。
DOMだけでは判断しにくいレイアウト崩れ、重なり、表示状態の調査に使う。

## ユーザーの挙動

ユーザーはChromeで確認したいタブを前面に出し、AI Agentへ画面確認を依頼する。
AI AgentはMCP tool `take_screenshot`を実行する。

```json
{
  "format": "png"
}
```

JPEGを使う場合は圧縮品質を指定できる。

```json
{
  "format": "jpeg",
  "quality": 80
}
```

## インターフェース

Bridge.appからChrome拡張へ送るWebSocket request:

```json
{
  "id": "take-screenshot-...",
  "type": "take_screenshot",
  "payload": {
    "format": "png"
  }
}
```

Chrome拡張はbase64画像、MIME type、撮影時のタブ情報を返す。
MCP responseでは画像を`type: "image"`、タブ情報を`type: "text"`として返す。

## ソースコード

```text
MCP take_screenshot
  → Bridge.app MCP HTTP
  → BrowserService
  → WebSocket { type: "take_screenshot" }
  → extension/background.js
  → BridgeScreenshotTools.takeScreenshot()
  → chrome.tabs.captureVisibleTab()
  → MCP image content
```

## 現在の制限

- 撮影対象はアクティブタブの現在表示されているviewport。
- ページ全体やスクロール領域の自動結合は行わない。
- Chromeの内部ページなど、Chrome側が撮影を許可しない画面では失敗する場合がある。
- 画像にはログイン後の情報や個人情報が含まれる可能性がある。
