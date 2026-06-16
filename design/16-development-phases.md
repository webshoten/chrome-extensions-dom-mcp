# 16. 開発フェーズ

[設計書トップへ戻る](../DESIGN.md)

## 概要

この章だけは最終ゴールではなく、実装の順序を扱う。
設計章に時系列を混ぜないため、段階的に作る内容はここへ集約する。

## フェーズ

フェーズ1は、GoヘルパーとChrome拡張をWebSocketで接続し、MV3 service workerの生存戦略を確認する。
Go初心者向けに、`main.go`、module、package、error、context、HTTP/WSの基本を確認しながら進める。
詳細: [phase-1-go-helper-and-extension.md](phase-1-go-helper-and-extension.md)

フェーズ2は、アクティブタブから`get_dom`を取得し、Goヘルパー経由で返せるようにする。
フェーズ3は、GoヘルパーをMCP stdioサーバーとしてClaudeから呼べるようにする。
フェーズ4は、`click`、`fill`、`navigate`などの操作系を追加する。
フェーズ5は、設定UI、認証、配布、DevTools級情報取得を整える。
