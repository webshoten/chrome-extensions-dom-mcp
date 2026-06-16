# 3. 全体アーキテクチャ

[設計書トップへ戻る](../DESIGN.md)

## 概要

構成は `Claude ←stdio/MCP→ Goヘルパー ←WebSocket→ Chrome拡張 → 対象ページ` とする。
ClaudeはMCPクライアント、GoヘルパーはMCPサーバー兼WSブリッジ、Chrome拡張はChrome内の実行主体になる。

## 最終ゴール

Goヘルパーを中心に、ClaudeからのMCPリクエストをChrome拡張へ中継し、Chrome上で取得・操作した結果をClaudeへ返す。
Chrome拡張は普段使いChromeのプロファイル、ログイン状態、現在のタブ状態をそのまま利用する。

## 詳細化する項目

- stdio/MCPとWebSocketの責務分離
- Chrome拡張内のbackground/content script構成
- 対象タブ選択と実行権限の流れ
- 将来CDPを使う場合の接続位置
