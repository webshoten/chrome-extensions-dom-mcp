# 12. 設定設計

[設計書トップへ戻る](../DESIGN.md)

## 概要

ポート、認証トークン、許可サイト、ログレベル、DevTools/CDP機能の有効化などを設定として扱う。
daemon側とChrome拡張側の設定がずれた場合でも復旧しやすくする。

## 最終ゴール

daemonは設定ファイルと環境変数をサポートし、Chrome拡張は接続に必要な最小設定だけを`chrome.storage`へ持つ。
ペアリングによりトークンや接続情報を自動共有し、ユーザーが設定ファイルを直接編集しなくても使える形にする。

## Network関連設定

Network系機能は段階的に有効化する。

初期状態で有効:

- `get_network`
- 短期Network履歴バッファ
- `query`、`failedOnly`、`limit`検索

将来設定で制御するもの:

- Network履歴の保持件数
- URL query redactionの有効/無効
- 除外ドメイン
- 許可ドメイン
- body previewの最大byte数
- Network取得用CDP詳細モード

推奨初期値:

```json
{
  "network": {
    "enabled": true,
    "maxEntries": 500,
    "redactUrlQuery": true,
    "maxBodyPreviewBytes": 10000,
    "cdpDetailEnabled": false
  }
}
```

標準の`get_network`でもredactionは必須とし、raw headers/raw bodyを返す設定は持たない。
拡張は`drag`に`debugger`権限を使うが、Network取得用CDP詳細モードは別設定として明示的に有効化する。

## 残す検討項目

- daemon設定ファイルの場所
- 拡張側に残す最小設定
- 設定不一致の検出
- 初期化、再ペアリング、リセット
- CDPモードのUI
- 許可/除外ドメインの保存形式
