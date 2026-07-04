# get_network

[DevTools級情報取得へ戻る](../11-devtools-data.md)

## 目的

`get_network`の目的は、AIがMCP経由でNetwork起因のバグを調査できるようにすること。
DevTools Networkタブの完全再現ではなく、AIが「どのタイミングで、どの通信に、どんな問題が起きたか」を判断できるNetworkデバッグレポートを返す。

## I/F方針

Network系toolは、まず`get_network` 1つに寄せる。
`get_network`は軽い一覧ではなく、redaction済みのheaders/body preview、GraphQL要約、timing、errorを含むデバッグレポートを返す。

`get_network_detail`は初期I/Fには入れない。
`requestId`はentry識別子として残すが、通常のデバッグは`get_network`の結果だけで進められるようにする。
将来CDPで追加取得が必要になった場合に、別toolを再検討する。

## AIの想定フロー

```text
1. get_networkでNetworkデバッグレポートを取る
2. statusCode、Chrome error、timing、GraphQL operation、body previewを見る
3. 失敗しているrequest、遅いrequest、payloadが怪しいrequestを判断する
4. 必要に応じてconsoleやDOMの情報と突き合わせる
```

## 入力

```json
{
  "query": "UpdatePatient",
  "failedOnly": true,
  "limit": 50,
  "includeHeaders": true,
  "includeBodyPreview": true,
  "maxPreviewBytes": 2000
}
```

| field | type | default | 内容 |
| --- | --- | --- | --- |
| `query` | string | `""` | URL、header名、body key、GraphQL operation、redaction済みpreviewを横断検索する。 |
| `failedOnly` | boolean | `false` | `error`あり、または`statusCode >= 400`だけに絞る。 |
| `limit` | number | `50` | 最大返却件数。 |
| `includeHeaders` | boolean | `true` | redaction済みheadersを含める。 |
| `includeBodyPreview` | boolean | `true` | redaction済みbody previewを含める。 |
| `maxPreviewBytes` | number | `2000` | request/response body previewの最大byte数。 |

細かいfilterは初期I/Fでは増やしすぎない。
AIが使いやすいよう、まず`query`を横断検索として扱う。
必要になった場合だけ`method`、`type`、`statusClass`などのfilterを追加する。

## queryの検索対象

`query`はURLだけを検索するものではない。
以下を横断検索する。

- URL
- method
- type
- status/error
- request/response header名
- content-type
- request bodyのkey名
- GraphQL operationName
- GraphQL query/mutation名
- GraphQL variablesのkey名
- redaction済みbody previewの文字列

redaction前のheader値やbody値は検索対象にしない。
検索対象は、返却されるredaction済みデータと安全な要約だけに限定する。

## 出力

```json
{
  "url": "https://example.com",
  "title": "Example",
  "capturedAt": "2026-06-20T00:00:00.000Z",
  "source": "webRequest",
  "query": "UpdatePatient",
  "failedOnly": true,
  "totalCount": 120,
  "matchedCount": 3,
  "returnedCount": 3,
  "entries": [
    {
      "requestId": "12345",
      "url": "https://example.com/graphql",
      "method": "POST",
      "type": "xmlhttprequest",
      "statusCode": 400,
      "error": "",
      "startedAt": "2026-06-20T00:00:00.000Z",
      "completedAt": "2026-06-20T00:00:01.000Z",
      "durationMs": 1000,
      "request": {
        "headers": {
          "authorization": "[REDACTED]",
          "content-type": "application/json"
        },
        "bodyPreview": "{\"operationName\":\"UpdatePatient\",\"variables\":{\"patientId\":\"[REDACTED]\"}}",
        "bodySize": 82,
        "bodyTruncated": false
      },
      "response": {
        "headers": {
          "content-type": "application/json"
        },
        "bodyPreview": "",
        "bodySize": null,
        "bodyTruncated": false,
        "bodyUnavailableReason": "requires_cdp"
      },
      "graphql": {
        "operationName": "UpdatePatient",
        "operationType": "mutation",
        "variableKeys": ["patientId", "input"]
      },
      "redactions": [
        "request.headers.authorization",
        "request.body.variables.patientId"
      ]
    }
  ]
}
```

## Entry

各entryは、AIがバグ原因を推測できる情報を含む。

- `requestId`: request識別子。将来CDPやログ照合に使う。
- `url`: redaction済みURL。
- `method`: HTTP method。
- `type`: Chrome request type。
- `statusCode`: HTTP status code。失敗前に落ちた場合は`null`。
- `error`: Chrome error。例: `net::ERR_NAME_NOT_RESOLVED`。
- `startedAt` / `completedAt` / `durationMs`: 発生タイミング。
- `request.headers`: redaction済みrequest headers。
- `request.bodyPreview`: redaction済みrequest body preview。
- `response.headers`: redaction済みresponse headers。
- `response.bodyPreview`: 取得できる場合だけ返す。CDPなしで取れない場合は空にする。
- `graphql`: GraphQLとしてparseできた場合の要約。
- `redactions`: redactionした箇所。

## GraphQL対応

GraphQLは多くのrequestが同じ`/graphql`へPOSTされる。
そのためURLだけでは、どのoperationが失敗したか判断できない。

`get_network`は、request bodyをparseできる場合に以下をentryへ含める。

- `graphql.operationName`
- `graphql.operationType`
- `graphql.variableKeys`
- redaction済みrequest body preview

variablesのraw値は返さない。
値はredaction済みpreviewとしてだけ返す。

## Response Body

`chrome.webRequest`だけではresponse bodyを基本的に取得できない。
そのためN2段階では、response bodyは以下のように返す。

```json
{
  "bodyPreview": "",
  "bodyUnavailableReason": "requires_cdp"
}
```

将来`chrome.debugger`/CDPを明示的に有効化した場合だけ、response body previewを返す。
その場合もredactionとサイズ制限を必須にする。

## Redaction

headers/bodyはrawでは返さない。
AIへ渡す前に必ずredactionする。

### Header

以下は常に`[REDACTED]`へ置き換える。

- `authorization`
- `proxy-authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`
- `x-csrf-token`
- `x-xsrf-token`

以下の語を含むheader名もredaction対象にする。

- `token`
- `secret`
- `credential`
- `session`
- `api-key`

### URL Query

以下の語を含むquery parameterはredactionする。

- `token`
- `access_token`
- `refresh_token`
- `id_token`
- `code`
- `key`
- `secret`
- `signature`
- `password`
- `session`
- `csrf`
- `xsrf`

### JSON Body

JSON bodyはkey名ベースで再帰的にredactionする。
以下の語を含むkeyはredaction対象にする。

- `password`
- `passwd`
- `token`
- `accessToken`
- `refreshToken`
- `idToken`
- `apiKey`
- `secret`
- `clientSecret`
- `session`
- `sessionId`
- `csrf`
- `xsrf`
- `email`
- `phone`
- `address`

### Text Body

JSONとしてparseできないtext bodyは、正規表現で以下をredactionする。

- bearer token形式
- emailらしい文字列
- `token=...`、`password=...`、`secret=...` のようなkey-value
- 長いhex/base64風のsecret候補

### Binary Body

binary bodyは本文を返さない。
`contentType`、`bodySize`、`bodyUnavailableReason: "binary_body"`だけ返す。

## サイズ制限

`get_network`は複数entryを返すため、payloadが大きくなりやすい。
以下を必須にする。

- `limit`
- `maxPreviewBytes`
- body previewの切り詰め
- binary body除外
- response bodyはCDPなしでは返さない

切り詰めた場合は`bodyTruncated: true`を返す。

## エラー判定

`failedOnly`は以下を失敗として扱う。

- `chrome.webRequest.onErrorOccurred`で`error`が入ったもの
- `statusCode >= 400`

`net::ERR_CACHE_MISS`のようにノイズになり得るものも、初期実装では隠さず返す。
AIが判断できるよう、raw errorは残す。

## データ保持

Network履歴はChrome拡張のbackground service worker内に短期バッファとして保持する。
初期実装では永続化しない。

- 保持上限は拡張側で固定件数に制限する
- MCP呼び出し時はアクティブタブの`tabId`に一致する履歴だけを返す
- 新しいものから返す
- service workerが停止・再起動した場合、履歴は消えてよい

## 実装境界

```text
MCP get_network
  → bridge mcp
  → HTTP POST /tool/get_network
  → bridge daemon
  → WebSocket { type: "get_network", payload: query }
  → Chrome拡張 background service worker
  → webRequest履歴を検索・redaction・整形
  → WebSocket response
  → MCP response
```

`POST /get-network`はcurl確認用と既存互換の入口として残す。

Deno bridge側はNetwork履歴を直接持たない。
Chrome拡張側がNetwork履歴の記録、検索、redaction、整形を担当する。
実装本体は`extension/network_tools.js`に置く。
