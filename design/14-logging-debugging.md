# 14. ログとデバッグ

[設計書トップへ戻る](../DESIGN.md)

## 概要

daemon、Chrome拡張、通信経路それぞれで、問題調査に必要なログを出す。
一方で、DOM本文、入力値、Cookie相当の情報などは原則ログに出さない。

## 最終ゴール

接続状態、ping/pong、再接続、MCPツール呼び出し、エラーコードを追えるログを用意する。
ユーザーのページ内容や機微情報を漏らさず、問題の切り分けができるデバッグ手順を整える。

## ログに出してよいもの

通常ログには、動作確認に必要なメタ情報だけを出す。

- daemon起動、停止
- listen address
- WebSocket接続数
- MCP tool名
- request id
- 処理時間
- エラーコード
- HTTP endpoint名

Network系では、原則として以下までにする。

- `get_network`が呼ばれたこと
- `query`の有無
- `failedOnly`の値
- `limit`
- 返却件数
- redaction件数
- body previewが切り詰められたか

## ログに出さないもの

以下はログに出さない。

- DOM本文
- URL queryを含む完全URL
- request headers
- response headers
- request body
- response body
- Cookie、Authorization、Set-Cookie
- 入力フォーム値
- redaction前の値

Network調査時も、daemon logとextension logにheaders/body previewを出さない。
必要な情報はMCPレスポンスとしてユーザー操作の結果にだけ返す。

## デバッグ手順

Network系の切り分けは以下の順で行う。

1. `/status`でdaemon起動と拡張接続数を確認する
2. `get_network({ limit: 10 })`で履歴が取れるか確認する
3. `get_network({ failedOnly: true })`で失敗判定が動くか確認する
4. `includeHeaders`、`includeBodyPreview`、`maxPreviewBytes`を調整して必要な範囲を確認する

ログだけでheaders/bodyの中身を追う設計にはしない。
Network情報はredaction済みMCPレスポンスで確認する。

## 残す検討項目

- daemonログの出力先
- 拡張ログの確認方法
- 接続トラブルの調査手順
- ログレベルごとの差分
