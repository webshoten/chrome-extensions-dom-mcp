# 16. 開発フェーズ

[設計書トップへ戻る](../DESIGN.md)

## 概要

この章だけは最終ゴールではなく、実装の順序を扱う。
設計章に時系列を混ぜないため、段階的に作る内容はここへ集約する。

## フェーズ

フェーズ1は、GoヘルパーとChrome拡張をWebSocketで接続し、MV3 service workerの生存戦略を確認する。
Go初心者向けに、`main.go`、module、package、error、context、HTTP/WSの基本を確認しながら進める。
詳細: [phase-1-go-helper-and-extension.md](phase-1-go-helper-and-extension.md)

フェーズ2は、アクティブタブから`get_dom`を取得し、Goヘルパー経由で返せるようにする。現在はMCP経由で動作確認済み。
フェーズ3は、GoヘルパーをMCP stdioサーバーとしてClaudeから呼べるようにする。現在は`dom-bridge daemon`と`dom-bridge mcp`を分離済み。
フェーズ4は、Chrome拡張パネルとmacOSセットアップ導線を整える。現在は初回セットアップ、停止、起動・再開コマンドのコピーUIまで実装済み。
フェーズ5は、`get_network`を追加する。まず`performance.getEntriesByType("resource")`ベースの軽量Network情報を扱う。
フェーズ6は、`click`、`fill`、`navigate`などの操作系を追加する。
フェーズ7は、設定UI、認証、配布、DevTools級情報取得を整える。
