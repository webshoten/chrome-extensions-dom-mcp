# 4. コンポーネント構成

[設計書トップへ戻る](../DESIGN.md)

| コンポーネント | 責務 |
| --- | --- |
| Bridge Desktop UI | 状態表示、AI Agent登録、ログイン時起動設定、直近tool表示 |
| MCP HTTP | MCP初期化、tool一覧、tool実行request/response |
| Browser service | MCP toolをChrome拡張向けmessageへ変換 |
| WebSocket bridge | Chrome拡張接続、request ID対応、timeout |
| Chrome拡張 | Chrome API実行、Network/Console履歴、将来のCDP接続 |
| ページ実行スクリプト | DOM取得、click、fill、wait、navigate |

MCP、WebSocket、Chrome API、ページ実行の境界を混ぜない。
