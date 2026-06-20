 
 
 
## 初期ローカル環境設定

```bash
## go install
$ brew install go
$ go version
go version go1.26.4 darwin/amd64
```

```bash
## 初期化
go mod init chrome-extensions-dom-mcp
```

```bash
## デバッグ
go install github.com/go-delve/delve/cmd/dlv@latest
```


```bash
## websocketライブラリ
go get github.com/gorilla/websocket
go list -m all
```

```bash
## websocket確認
brew install websocat
## websocket接続
websocat ws://127.0.0.1:9333/ws
```

## 現在の起動モデル

`dom-bridge` は2つの役割に分かれています。

```text
Chrome拡張 ←WebSocket→ dom-bridge daemon ←HTTP→ dom-bridge mcp ←stdio/MCP→ Codex/Claude
```

Chrome拡張との接続を持つのは daemon だけです。
MCP プロセスは短命・再起動される可能性があるため、WebSocket 接続状態を持たず、daemon の HTTP API へ問い合わせます。

```bash
## daemon 起動
./dom-bridge daemon

## MCP 側の実行ファイルを更新
go build -o dom-bridge ./cmd/dom-bridge
```

引数なしの `./dom-bridge` は MCP stdio 用です。
手で実行して動作確認する場合は、まず別ターミナルで `./dom-bridge daemon` を起動してください。
