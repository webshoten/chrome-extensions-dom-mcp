 
 
 
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

