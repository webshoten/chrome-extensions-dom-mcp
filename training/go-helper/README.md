# Go Helper Training

このフォルダは、Go初心者向けに実装を小さな断面ごとに読むためのメモです。

コード本体のコメントは、後から保守する人向けに「なぜそうしているか」を中心に書きます。
一方、このフォルダでは、JS/TS経験者がGoの文法に慣れるために、かなり細かく説明します。

## 断面一覧

- [01_handle_get_dom.md](01_handle_get_dom.md)
  - `/get-dom` のHTTPハンドラ
  - `GET` チェック
  - `context.WithTimeout`
  - `b.request`
  - Goの `err != nil`
  - HTTPレスポンス書き込み
- [02_mcp_stdio.md](02_mcp_stdio.md)
  - stdio型MCPの最小構造
  - `io.Reader` / `io.Writer`
  - `bufio.Scanner`
  - `json.Encoder`
  - `switch`
  - `goroutine`
