# 5. 通信設計

[設計書トップへ戻る](../DESIGN.md)

## 外部インターフェース

AI Agentは`POST http://127.0.0.1:9333/mcp`へMCP JSON-RPCを送る。
Chrome拡張は`ws://127.0.0.1:9333/ws`へ自分から接続する。

```text
MCP tools/call
  → Bridge.app MCP HTTP
  → Browser service
  → WebSocket request
  → Chrome拡張
  → Chrome API / ページ実行
  → 同じrequest IDのWebSocket response
  → MCP tool result
```

内部確認用として`GET /status`と`POST /tool/<toolName>`も持つ。
すべてのtool実行にtimeoutを設け、拡張未接続や未応答をAIへエラーとして返す。
