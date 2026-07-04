# get_dom

[DOM取得設計へ戻る](../09-dom-capture.md)

## 目的

`get_dom`の目的は、AIが現在のChromeタブの状態を理解できるように、アクティブタブのDOMスナップショットをMCP経由で返すこと。

Deno bridgeが直接DOMを読むのではなく、Chrome拡張が対象タブにscriptを実行してDOMを取得する。

## I/F方針

`get_dom`はまず引数なしのtoolとして扱う。
対象はアクティブウィンドウのアクティブタブ。

```json
{}
```

将来的にDOMサイズや除外対象を調整したくなった場合だけ、以下のようなオプションを追加する。

```json
{
  "includeHtml": true,
  "maxHtmlBytes": 1000000,
  "excludeScripts": false,
  "excludeStyles": false
}
```

## 出力

現在の実装は以下を返す。

```json
{
  "url": "https://example.com",
  "title": "Example",
  "capturedAt": "2026-06-20T00:00:00.000Z",
  "html": "<html>...</html>"
}
```

## Entry

- `url`: 取得時点のページURL。
- `title`: `document.title`。
- `capturedAt`: 拡張がDOMを取得した時刻。
- `html`: `document.documentElement.outerHTML`。

## 実装経路

```text
MCP get_dom
  → bridge mcp
  → HTTP POST /tool/get_dom
  → bridge daemon
  → WebSocket { type: "get_dom" }
  → Chrome拡張 background service worker
  → chrome.scripting.executeScript
  → document.documentElement.outerHTML
  → WebSocket response
  → MCP response
```

`GET /get-dom`はcurl確認用と既存互換の入口として残す。

## 現在の制限

- iframeの中身は基本的に含めない。
- Shadow DOMの中身は通常のouterHTMLだけでは完全には取れない。
- script/style除外はまだ行わない。
- DOMが巨大な場合の切り詰め仕様は未実装。
- 入力値やログイン後情報がDOMに含まれる可能性がある。

## セキュリティ

DOMには個人情報や業務情報が含まれる可能性がある。
初期実装ではraw HTMLを返すため、対象タブをユーザーが明示的に開いていることを前提にする。

将来的には以下を検討する。

- サイズ制限
- script/style除外
- 入力値のredaction
- 許可/除外ドメイン
- iframe/Shadow DOMの扱い
