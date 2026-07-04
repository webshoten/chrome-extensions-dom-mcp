# get_console

[DevTools級情報取得へ戻る](../11-devtools-data.md)

## 目的

`get_console`の目的は、AIがMCP経由でページのconsole、page error、unhandled rejectionを確認できるようにすること。
Network情報と並べて、どのタイミングでどんなエラーが出たかを判断するために使う。

## 入力

```json
{
  "query": "TypeError",
  "levels": ["error", "pageerror", "unhandledrejection"],
  "limit": 50,
  "clear": false
}
```

## 出力

```json
{
  "url": "https://example.com",
  "title": "Example",
  "capturedAt": "2026-06-20T00:00:00.000Z",
  "totalCount": 10,
  "matchedCount": 2,
  "returnedCount": 2,
  "entries": [
    {
      "level": "error",
      "text": "TypeError: failed",
      "args": ["TypeError: failed"],
      "capturedAt": "2026-06-20T00:00:00.000Z",
      "source": "console"
    }
  ]
}
```

## 実装境界

```text
MCP get_console
  → bridge mcp
  → HTTP POST /tool/get_console
  → bridge daemon
  → WebSocket { type: "get_console", payload: query }
  → Chrome拡張 background service worker
  → content scriptのconsole bufferを取得
  → MCP response
```

`page_console_hook.js`はMAIN worldでconsole/errorをhookする。
`console_capture.js`はisolated worldでbufferを持ち、backgroundからの取得要求に応答する。

## 現在の制限

- 拡張が読み込まれる前に出た古いconsoleは取れない。
- service workerやcontent scriptが再読み込みされるとbufferは消える。
- consoleのobjectはJSON化できる範囲だけ返す。
