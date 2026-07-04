# 4. コンポーネント構成

[設計書トップへ戻る](../DESIGN.md)

## 概要

この章は、全体アーキテクチャを実行時の部品に分け、各部品の責務を整理する。
通信経路は3章、Deno内部のmodule構成は4.5章で扱う。

## コンポーネント

| コンポーネント | 主な責務 | 持たない責務 |
| --- | --- | --- |
| `bridge mcp` | AIとのMCP stdio通信、tool定義、daemon HTTP APIへのproxy | Chrome拡張とのWebSocket接続、Chrome API実行 |
| `bridge daemon` | localhost HTTP API、Chrome拡張とのWebSocket接続、接続状態管理 | MCP stdio、Chrome API実行 |
| Chrome拡張 background service worker | daemonへのWebSocket接続、Chrome API実行、DOM/Network/Console取得の入口 | MCP stdio、OSコマンド実行 |
| ページ実行スクリプト | 現在タブ内でのDOM取得、将来のクリック/入力などのページ操作 | daemon管理、MCP tool定義 |
| 拡張パネル | daemon接続状態、extension接続状態、現在タブのアクセス可否 | DOM/Network取得ロジック、Bridge起動 |
| 設定保存領域 | ポート、トークン、許可サイト、表示設定の保持 | tool実行ロジック |

## 基本方針

MCP、HTTP、WebSocket、Chrome API、ページ内実行の境界を混ぜない。
Chrome内でしか取れない情報はChrome拡張に寄せ、AI向けのtool I/Fは`bridge mcp`に寄せる。
設定や認証情報は、必要な場所にだけ保存し、同期が必要な項目を明示する。

## 詳細化する項目

- `bridge mcp`と`bridge daemon`の責務分離
- background service workerの肥大化を防ぐ分割方針
- content scriptと`chrome.scripting.executeScript`の使い分け
- LaunchAgentとdaemon起動状態の扱い
- 設定保存先と同期対象
