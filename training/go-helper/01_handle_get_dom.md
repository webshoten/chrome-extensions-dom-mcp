# 01. handleGetDOM

対象コード:

```go
func (b *Bridge) handleGetDOM(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	response, err := b.request(ctx, Message{
		ID:   fmt.Sprintf("get-dom-%d", time.Now().UnixNano()),
		Type: "get_dom",
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	if response.Error != nil {
		http.Error(w, response.Error.Message, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(response.Payload)
}
```

## この関数の役割

`/get-dom` にHTTPアクセスされたときに動く関数です。

流れはこれです。

```text
curl http://127.0.0.1:9333/get-dom
  ↓
handleGetDOM
  ↓
Chrome拡張へ get_dom を依頼
  ↓
Chrome拡張からDOM JSONを受け取る
  ↓
HTTPレスポンスとして返す
```

## func (b *Bridge) の意味

```go
func (b *Bridge) handleGetDOM(...)
```

JS/TSのclassで考えると、だいたいこれです。

```ts
class Bridge {
  handleGetDOM(req, res) {
    // ...
  }
}
```

Goにはclassがないので、`(b *Bridge)` と書いて「Bridgeにくっついた関数」にします。

`b` はJS/TSの `this` に近いです。

## w と r

```go
w http.ResponseWriter
r *http.Request
```

Expressでいうと近いのはこれです。

```ts
(req, res) => {}
```

ただしGoでは順番が逆に見えます。

```text
w = responseを書くもの
r = requestを読むもの
```

## GETだけ受け付ける

```go
if r.Method != http.MethodGet {
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	return
}
```

TS風に書くとこれです。

```ts
if (req.method !== "GET") {
  res.status(405).send("method not allowed");
  return;
}
```

`http.MethodGet` は `"GET"` の定数です。
`http.StatusMethodNotAllowed` は `405` の定数です。

このブロックは「GET以外ならここで終了する」門番です。

## 10秒タイムアウト

```go
ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
defer cancel()
```

Chrome拡張から返事が来ない場合に、HTTPリクエストが永久に待たないようにします。

TSの `AbortController` に近いです。

```ts
const controller = new AbortController();

setTimeout(() => {
  controller.abort();
}, 10_000);
```

`defer cancel()` は「この関数が終わるときに `cancel()` して後片付けする」という意味です。

## Chrome拡張へ依頼する

```go
response, err := b.request(ctx, Message{
	ID:   fmt.Sprintf("get-dom-%d", time.Now().UnixNano()),
	Type: "get_dom",
})
```

TS風に書くとこれです。

```ts
const response = await bridge.request({
  id: `get-dom-${Date.now()}`,
  type: "get_dom",
});
```

Goでは `await` はありません。
この `b.request(...)` の中で、返事が来るまで待っています。

`ID` はHTML要素のidではありません。
リクエストとレスポンスを対応させるための通信IDです。

実際にWebSocketへ送るJSONはこういう形です。

```json
{
  "id": "get-dom-1780000000000000000",
  "type": "get_dom"
}
```

## err != nil

```go
if err != nil {
	http.Error(w, err.Error(), http.StatusServiceUnavailable)
	return
}
```

Goでは、失敗する可能性がある関数はよくこう返します。

```go
結果, エラー
```

TSの `try/catch` に近いですが、Goでは戻り値でエラーを受け取ります。

```ts
try {
  const response = await bridge.request(...);
} catch (err) {
  res.status(503).send(String(err));
  return;
}
```

`nil` はJS/TSの `null` に近いです。

```go
err != nil
```

は「エラーがある」という意味です。

このエラーは、通信そのものの失敗です。

例:

```text
Chrome拡張が接続されていない
10秒以内に返事が来ない
WebSocket送信に失敗した
```

## response.Error

```go
if response.Error != nil {
	http.Error(w, response.Error.Message, http.StatusBadGateway)
	return
}
```

これは「通信は成功したが、Chrome拡張側のDOM取得が失敗した」ケースです。

たとえばChrome拡張側からこう返る場合です。

```json
{
  "id": "get-dom-123",
  "type": "error",
  "error": {
    "code": "DOM_CAPTURE_FAILED",
    "message": "Cannot access contents of the page"
  }
}
```

`err != nil` と `response.Error != nil` の違いは重要です。

```text
err != nil
  GoからChrome拡張への通信自体が失敗

response.Error != nil
  通信は成功したが、拡張側の処理が失敗
```

## 成功時のレスポンス

```go
w.Header().Set("Content-Type", "application/json")
_, _ = w.Write(response.Payload)
```

TS/Expressならこうです。

```ts
res.setHeader("Content-Type", "application/json");
res.send(response.payload);
```

`response.Payload` には、Chrome拡張が返したDOM情報が入っています。

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "capturedAt": "2026-06-19T...",
  "html": "<html>...</html>"
}
```

`_, _ =` は「戻り値を使わない」という意味です。

`w.Write` は本当はこういう戻り値を返します。

```go
書いたバイト数, エラー
```

ここではHTTPレスポンス最後の書き込みなので簡略化しています。

