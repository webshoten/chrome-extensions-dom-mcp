# 5. 通信設計

[設計書トップへ戻る](../DESIGN.md)

## 概要

ClaudeとGoヘルパーはMCP stdioで通信し、GoヘルパーとChrome拡張はlocalhost WebSocketで通信する。
拡張内部ではbackground service workerから対象タブへメッセージまたはスクリプト実行で処理を渡す。

## 最終ゴール

すべてのリクエストにIDを持たせ、MCPリクエスト、WSメッセージ、拡張内処理、レスポンスを対応付ける。
タイムアウト、キャンセル、エラー応答を定義し、途中で止まってもClaude側へ説明可能な結果を返す。

## 詳細化する項目

- MCPツール定義
- WSメッセージ形式
- request/response/error/ping/pongの型
- タイムアウトと再試行の扱い
