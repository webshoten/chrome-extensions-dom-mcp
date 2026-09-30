# 4.5 コードアーキテクチャ

[設計書トップへ戻る](../DESIGN.md)

## Deno / TypeScript

- `src/desktop/main.ts`: Desktop app entrypoint、window、Dock、tray
- `src/desktop/ui.ts`: 状態画面と初回設定HTTP API
- `src/desktop/agent_setup.ts`: Codex/Claude Code MCP登録
- `src/desktop/login_item.ts`: macOSログイン時起動
- `src/bridge/mcp/http_transport.ts`: Streamable HTTP transport
- `src/bridge/mcp/server.ts`: MCP JSON-RPC dispatcher
- `src/bridge/mcp/tools.ts`: 公開tool契約
- `src/bridge/daemon/http_api.ts`: `/mcp`、`/status`、`/tool`、`/ws`
- `src/bridge/daemon/browser_service.ts`: browser tool request変換
- `src/bridge/daemon/ws_bridge.ts`: Chrome拡張接続とrequest ID管理
- `src/bridge/protocol/types.ts`: WS messageとtool payload型

## Chrome拡張

- `background.js`: WebSocket接続とtool振り分け
- `active_tab.js`: 現在タブ取得
- `dom_tools.js`: DOM取得
- `network_tools.js`: Network履歴とredaction
- `console_tools.js`: Console履歴
- `action_tools.js`: click、double click、fill、wait、navigate
- `drag_tools.js`: `chrome.debugger`とCDPによるmodifier対応drag

Chrome API実行は拡張側、MCPと状態管理はDesktop app側へ置く。
CDPは拡張内の`chrome.debugger`を通し、Desktop appから直接Chrome profileへ接続しない。
