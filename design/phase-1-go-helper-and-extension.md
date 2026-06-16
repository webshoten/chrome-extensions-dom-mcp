# フェーズ1: GoヘルパーとChrome拡張のWS接続

[開発フェーズへ戻る](16-development-phases.md)

## 目的

GoヘルパーがlocalhostでWebSocketを待ち受け、Chrome拡張のMV3 service workerが接続できることを確認する。
さらに、20秒ごとのping/pongでservice workerの生存を維持し、切断時に再接続できることを確認する。

## Go初心者向けに学ぶこと

- `go mod init`: Goプロジェクトの作り方
- `package main`: 実行ファイルになるGoコードの入口
- `func main()`: プログラム開始地点
- `import`: 標準ライブラリや外部ライブラリの読み込み
- `error`: Goの基本的な失敗表現
- `context.Context`: 停止やtimeoutを伝えるための仕組み
- `net/http`: localhostでHTTP/WSサーバーを立てる基礎
- `gofmt` と `go test`: Goコードの整形と確認

## 実装ステップ

1. Goが動くことを確認する。
2. `go.mod` を作る。
3. `cmd/dom-bridge/main.go` に最小の `main` を作る。
4. `127.0.0.1:9333` でHTTPサーバーを起動する。
5. `/health` を返し、ヘルパーが起動していることを確認する。
6. WebSocket endpointを追加する。
7. Chrome拡張のbackground service workerからWS接続する。
8. 拡張から20秒ごとにpingし、Goヘルパーがpongを返す。
9. WS切断時に拡張が再接続することを確認する。

## このフェーズで作らないもの

- MCP stdio対応
- `get_dom`
- click/fill/navigateなどの操作系
- 認証トークンの本実装
- インストーラ

## 成功条件

Goヘルパーを起動すると、Chrome拡張がWS接続できる。
30秒以上放置しても、ping/pongにより接続が維持される。
Goヘルパーを再起動したあと、拡張が自動で再接続できる。
