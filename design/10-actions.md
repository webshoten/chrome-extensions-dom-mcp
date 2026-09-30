# 10. 操作系ツール設計

[設計書トップへ戻る](../DESIGN.md)

## 概要

ClaudeからChrome上のページを操作できるように、MCPツールとしてクリック、入力、遷移、スクリーンショットなどを公開する。
単発操作だけでなく、将来的な複数ステップ操作も見据えて結果と失敗理由を構造化する。

## 最終ゴール

`click`、`drag`、`fill`、`navigate`、`screenshot`などを提供し、CSSセレクタ、テキスト、座標、アクセシビリティ情報による要素指定を扱えるようにする。
React/Vue等のイベント発火、待機、リトライ、操作前確認を設計し、できるだけ確実に操作できる形にする。

## 現在の実装

初期実装では、アクティブタブに対して以下のMCP toolを公開する。

- `click`: CSS selectorまたは表示テキストで要素をクリックする
- `double_click`: selector、表示テキスト、またはviewport座標をダブルクリックする。`list_tabs`で取得した`targetId`を必須とする
- `drag`: selector、表示テキスト、またはviewport座標間へCDPのマウス入力を送る。`list_tabs`で取得した`targetId`とmodifier keyを併用できる
- `fill`: input/textarea/select/contenteditableへ値を入れる
- `wait_for`: selectorまたは表示テキストが現れる/隠れるまで待つ
- `navigate`: アクティブタブをhttp/https URLへ遷移する

詳細: [操作系tools](tools/actions.md)

## 詳細化する項目

- 要素指定方式
- 操作前確認と安全制限
- 待機、リトライ、失敗理由
