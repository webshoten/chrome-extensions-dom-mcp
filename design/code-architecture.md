# 4.5 コードアーキテクチャ

[設計書トップへ戻る](../DESIGN.md)

## 概要

Goヘルパーは `cmd/dom-bridge` と `internal/*` に分け、MCP、WebSocket、usecase、protocol、config、logging の責務を固定する。
MCP handlerやWS handlerに処理を直接書かず、`internal/usecase` に機能単位の処理を集める。

## 最終ゴール

DOM取得、ページ操作、Network/Performance/Memory取得などのAPIが増えても、transport層やChrome API呼び出し層にロジックが散らばらない構成にする。
メッセージ形式、エラー形式、設定、ツール定義を型として揃え、Goヘルパーと拡張の間で仕様ずれが起きにくい形にする。
Chrome実環境が必要な部分と、通常の単体テストで検証できる部分を分ける。

## Goヘルパーのディレクトリ方針

- `cmd/dom-bridge/main.go`: サブコマンド分岐、依存生成、MCP/daemon起動だけを行う
- `internal/mcp`: MCP stdio、tool登録、MCP request/response変換だけを行う
- `internal/httpapi`: daemon HTTP API、`/status`、`/get-dom`、MCPからdaemonへのproxyを扱う
- `internal/ws`: WS待ち受け、認証、client管理、ping/pong、timeoutだけを行う
- `internal/usecase`: `get_dom`、`get_network`、`click`、`fill`、`navigate`などの処理をまとめる
- `internal/protocol`: WS message、payload、result、error codeを定義する
- `internal/config`: 設定ファイル、環境変数、default、validationを扱う
- `internal/logging`: logger初期化と機微情報のredactionを扱う

## helper起動モデル

`dom-bridge daemon` は `127.0.0.1:9333` をlistenし、Chrome拡張のWebSocket接続とHTTP APIを担当する。
引数なしの `dom-bridge` はMCP stdioサーバーとして動き、Chrome拡張とは直接つながらず、daemonのHTTP APIへproxyする。
これにより、Codex/Claude側のMCP再起動でChrome拡張との接続状態が割れることを避ける。

Chrome拡張はMV3 service workerのライフサイクルにより、短時間に複数のWebSocket接続を残すことがある。
Go側は接続を1本に正規化しようとして古い接続を強制closeしない。
リクエストは接続中のWebSocketへbroadcastし、同じIDで最初に返ったレスポンスを採用する。

Chrome拡張パネルは状態表示とmacOS向けコマンドコピーを提供する。
初回セットアップ、停止、起動・再開は別アコーディオンに分け、拡張からOSコマンドを直接実行しない。

## 現在の実装済み範囲

- `get_dom`: MCP、daemon HTTP、WS、Chrome拡張の経路で動作確認済み
- macOS配布物生成: `dist/install-macos.sh`、`dom-bridge-darwin-amd64`、`dom-bridge-darwin-arm64`
- Chrome拡張パネル: daemon接続状態表示、macOS初回セットアップ/停止/起動・再開コマンドのコピー
- daemon起動: `launchd` user agentを想定し、`RunAtLoad=true`、`KeepAlive=false`とする

## 次の実装対象

次は`get_network`を追加する。
最初の範囲はページ内`performance` APIから取得できるresource timing情報に限定する。
これにより、追加権限なしでNetwork概況を確認できる。
`chrome.webRequest`や`chrome.debugger`が必要な詳細情報は後続フェーズに分ける。

## 禁止する依存

- `internal/usecase` から `internal/mcp` をimportしない
- `internal/usecase` から `internal/ws` をimportしない
- `internal/usecase` に `net/http` やWebSocketライブラリを入れない
- MCP tool handler内にDOM取得や操作の本体を書かない
- WS read/write loop内にツール固有の処理を書かない
- protocol境界を越えて `map[string]any` を持ち回らない

## Chrome拡張側

background service workerは、WS接続、keepalive、再接続、リクエスト振り分けを担当する。
ページに依存する処理はcontent scriptまたは`chrome.scripting.executeScript`側へ寄せる。
拡張パネルは接続状態、ペアリング、設定、復旧案内を扱い、DOM取得や操作ロジックを持たない。

## テスト方針

`internal/usecase` はChrome、MCP、実WSなしで単体テストできるようにする。
`internal/ws` は `httptest` などで認証、ping/pong、timeout、切断をテストする。
設定読み込みは一時ディレクトリと環境変数overrideでテストする。
Goコード変更後は `gofmt` と `go test ./...` を必須にする。

## 詳細化する項目

- Chrome拡張のディレクトリ構成
- Goと拡張で共有するプロトコル仕様の管理方法
- Chrome実機テストの切り分け
