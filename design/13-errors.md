# 13. エラー設計

[設計書トップへ戻る](../DESIGN.md)

## 概要

エラーはClaudeがユーザーへ説明しやすい構造で返す。
内部原因、ユーザー向けメッセージ、復旧方法を分け、原因調査とUXの両方に使える形にする。

## 最終ゴール

ポート使用中、拡張未接続、認証失敗、対象タブなし、権限不足、タイムアウト、DOMサイズ超過などを明確に分類する。
復旧可能なエラーでは、拡張を開く、再ペアリングする、ポートを変えるなどの具体的な次の行動を返す。

## Network系エラー

Network系ツールでは、通常の通信失敗と、取得対象が存在しない失敗を分ける。

| code | 発生条件 | 復旧案内 |
| --- | --- | --- |
| `NETWORK_CAPTURE_FAILED` | 拡張側でNetwork一覧の取得に失敗した | 拡張の再読み込み、対象タブの確認 |
| `NETWORK_PREVIEW_UNAVAILABLE` | headers/body previewなどが現在の取得層では取れない | CDPが必要か、取得できないbodyであることを伝える |
| `NETWORK_BODY_TRUNCATED` | body previewが上限で切り詰められた | `maxBodyBytes`を増やすか、必要部分だけ確認する |
| `NETWORK_PERMISSION_REQUIRED` | `webRequest`や`debugger`権限が不足している | 拡張の権限許可・再読み込みを案内する |

`NETWORK_BODY_TRUNCATED`は致命的エラーではなく、レスポンス内の`bodyTruncated: true`として返せる場合はMCPエラーにしない。
AIが判断しやすいよう、切り詰められた事実を構造化して返す。

Networkでは、redaction自体はエラーではない。
`redactions`配列に隠した場所を記録し、ユーザーへ「秘匿情報を隠した結果」と説明できるようにする。

## 残す検討項目

- エラーコード体系
- MCPエラーへのマッピング
- ユーザー向けメッセージ
- ログに残す情報と残さない情報
