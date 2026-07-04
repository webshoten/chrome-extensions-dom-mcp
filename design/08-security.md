# 8. 認証とセキュリティ

[設計書トップへ戻る](../DESIGN.md)

## 概要

bridge daemonはlocalhost限定で待ち受け、拡張との通信には認証トークンを使う。
DOMや通信情報には個人情報、ログイン後情報、社外秘が含まれ得るため、取得・送信・ログ出力を慎重に扱う。

## 最終ゴール

認証トークンはユーザーが手入力せず、bridge daemonとChrome拡張のペアリングで自動共有する。
対象サイト制限、権限最小化、操作前確認、ログの秘匿を組み合わせ、強力な機能を安全に使える形にする。

## Network情報の扱い

Network情報はDOMよりも秘匿情報を含みやすい。
特にheaders、URL query、request body、response bodyには、認証情報や個人情報が混ざる可能性が高い。

そのため`get_network`は、rawデータではなくredaction済みNetworkデバッグレポートを返す。

`get_network`はheaders/body previewを含めてよいが、raw headers/raw bodyは返さない。
Authorization、Cookie、Set-Cookie、token、password、secret、emailなどは標準でredactionする。
redactionした箇所は`redactions`としてレスポンスに含める。

Network情報は永続保存しない。
daemonや拡張のログにもheaders/bodyを出さない。
取得対象はactive tabかつ短期バッファ内のrequestに限定する。

## 権限の段階化

Chrome拡張権限は機能段階ごとに増やす。

- DOM取得: `scripting`、`tabs`
- Networkデバッグレポート: `webRequest`
- request body / headers preview拡張: `webRequest`追加オプション、必要に応じて`webRequestBlocking`
- DevTools級詳細: `debugger`

`debugger`権限はユーザーに強く見える権限であり、Chrome上にもデバッグ中表示が出る可能性がある。
そのため初期状態では使わず、将来の詳細モードとして明示的に有効化する。

## 残す検討項目

- ローカルペアリング方式
- WS認証トークンの保存と再発行
- 許可サイト/除外サイトの設計
- 操作系とDevTools/CDP利用時の確認
- Network redaction設定
- CDPモードの有効化UI
