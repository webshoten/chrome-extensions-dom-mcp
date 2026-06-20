# 02. MCP stdio

対象コード:

```go
go func() {
	err := http.ListenAndServe(addr, mux)
	if err != nil {
		log.Fatal(err)
	}
}()

if err := runMCPServer(context.Background(), os.Stdin, os.Stdout, bridge); err != nil {
	log.Fatal(err)
}
```

## この変更の役割

前回までのGoヘルパーは、主にHTTPとWebSocketの実験用でした。

今回から、ClaudeやCodexのMCPクライアントが呼べるように、標準入力と標準出力でJSON-RPCを読み書きします。

流れはこうです。

```text
MCPクライアント
  ↓ stdin
runMCPServer
  ↓
Bridge.request
  ↓ WebSocket
Chrome拡張
```

## なぜHTTPサーバーをgoroutineにしたか

```go
go func() {
	err := http.ListenAndServe(addr, mux)
	if err != nil {
		log.Fatal(err)
	}
}()
```

`http.ListenAndServe` は、サーバーを起動したあと戻ってきません。
そのまま呼ぶと、後ろに書いた `runMCPServer` まで処理が進みません。

そこで `go func() { ... }()` で別の goroutine として動かします。

TS風にかなり雑に言うと、バックグラウンドタスクを開始する感覚です。

```ts
startHttpServerInBackground();
await runMcpServer();
```

## os.Stdin と os.Stdout

```go
runMCPServer(context.Background(), os.Stdin, os.Stdout, bridge)
```

`os.Stdin` は標準入力、`os.Stdout` は標準出力です。

stdio型MCPでは、HTTPポートではなくこの2本を使います。

```text
Claude -> stdin  -> Goヘルパー
Claude <- stdout <- Goヘルパー
```

そのため、`log.SetOutput(os.Stderr)` でログは標準エラーへ出しています。
標準出力にログを混ぜると、MCPのJSON応答が壊れるからです。

## io.Reader / io.Writer

```go
func runMCPServer(ctx context.Context, input io.Reader, output io.Writer, bridge *Bridge) error
```

`io.Reader` は「読めるもの」、`io.Writer` は「書けるもの」を表すインターフェースです。

今回は本番ではこう渡しています。

```go
input  = os.Stdin
output = os.Stdout
```

ただし関数の引数を `io.Reader` / `io.Writer` にしておくと、将来テストで文字列バッファを渡せます。

## bufio.Scanner

```go
scanner := bufio.NewScanner(input)
```

`Scanner` は入力を1行ずつ読むための道具です。

MCPクライアントからは、だいたいこういうJSONが1行で届きます。

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

`scanner.Scan()` が1回成功するたびに、1行分のJSONを処理します。

## json.Unmarshal

```go
var request MCPRequest
if err := json.Unmarshal(scanner.Bytes(), &request); err != nil {
	continue
}
```

`json.Unmarshal` はJSON文字列をGoのstructに変換します。

TSならこの感覚です。

```ts
const request = JSON.parse(line);
```

Goでは変換先を先に用意して、`&request` として渡します。
`&` は「この変数の場所を渡す」という意味です。

## 通知は返事しない

```go
if request.ID == nil {
	continue
}
```

JSON-RPCでは、`id` があるものはリクエスト、`id` がないものは通知として扱います。

通知には返事を書きません。

## switch

```go
switch request.Method {
case "initialize":
	// ...
case "tools/list":
	// ...
case "tools/call":
	// ...
default:
	// ...
}
```

TSの `switch` と近いです。

今回の最小MCPでは、まずこの3つだけを扱います。

```text
initialize
  MCPクライアントとの初期化

tools/list
  使えるツール一覧を返す

tools/call
  get_dom を実行する
```

## json.Encoder

```go
encoder := json.NewEncoder(output)
encoder.Encode(response)
```

`json.Encoder` はGoの値をJSONにして `output` へ書きます。

今回なら `output` は `os.Stdout` なので、MCPクライアントへ返事が返ります。

## get_domの呼び出し

```go
response, err := b.request(requestCtx, Message{
	ID:   fmt.Sprintf("get-dom-%d", time.Now().UnixNano()),
	Type: "get_dom",
})
```

ここはHTTP版の `/get-dom` と同じです。

つまりMCP対応を足しても、Chrome拡張との通信ロジックは使い回しています。
入口がHTTPからMCPに増えただけです。

```text
HTTP /get-dom -> b.request -> Chrome拡張
MCP get_dom   -> b.request -> Chrome拡張
```

この形にしておくと、次に `click` や `fill` を追加するときも同じ流れで足せます。
