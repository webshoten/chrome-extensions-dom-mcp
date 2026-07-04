# 5. 通信設計

[設計書トップへ戻る](../DESIGN.md)

## 概要

Claude/Codexとbridge mcpはMCP stdioで通信し、bridge daemonとChrome拡張はlocalhost WebSocketで通信する。
拡張内部ではbackground service workerから対象タブへメッセージまたはスクリプト実行で処理を渡す。

## 最終ゴール

すべてのリクエストにIDを持たせ、MCPリクエスト、WSメッセージ、拡張内処理、レスポンスを対応付ける。
タイムアウト、キャンセル、エラー応答を定義し、途中で止まってもClaude側へ説明可能な結果を返す。

## 詳細化する項目

- MCPツール定義
- WSメッセージ形式
- request/response/error/ping/pongの型
- タイムアウトと再試行の扱い

## 現在のツール通信

各MCP toolは同じ通信経路を使う。
MCP側のtool callをdaemon HTTP APIへ変換し、Chrome拡張へWebSocket messageを送る。

```text
MCP tool call
  → bridge mcp
  → daemon HTTP API POST /tool/<toolName>
  → WebSocket request
  → Chrome extension background service worker
  → WebSocket response
  → MCP tool result
```

現在のmessage type:

| tool | HTTP | WS request type | WS response type |
| --- | --- | --- | --- |
| `get_dom` | `POST /tool/get_dom` | `get_dom` | `get_dom_result` |
| `get_network` | `POST /tool/get_network` | `get_network` | `get_network_result` |
| `get_console` | `POST /tool/get_console` | `get_console` | `get_console_result` |
| `click` | `POST /tool/click` | `click` | `click_result` |
| `fill` | `POST /tool/fill` | `fill` | `fill_result` |
| `wait_for` | `POST /tool/wait_for` | `wait_for` | `wait_for_result` |
| `navigate` | `POST /tool/navigate` | `navigate` | `navigate_result` |

`GET /get-dom`と`POST /get-network`は、curl確認用と既存互換のために残す。
新しいtoolは`POST /tool/<toolName>`へ寄せる。

例:

```http
POST /tool/click
Content-Type: application/json

{"selector":"button[type=submit]"}
```

daemonから拡張へ送るWS message:

```json
{
  "id": "request-id",
  "type": "click",
  "payload": {
    "selector": "button[type=submit]"
  }
}
```

すべてのWS requestは`id`を持ち、daemonは同じ`id`のresponseを待つ。
MV3 service workerの都合で複数WebSocket接続が残ることがあるため、daemonは接続中のclientへbroadcastし、最初に返った同じ`id`のresponseを採用する。

`get_network`のheaders/body previewは、Chrome拡張側でredactionしてからbridgeへ返す。
bridge側は原則としてredaction済みpayloadを中継するだけにする。
ただし将来的にはbridge側でも防御的な二重redactionを入れられるよう、protocol上は`redactions`配列を標準フィールドとして扱う。
