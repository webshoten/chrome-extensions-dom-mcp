# 4.5 コードアーキテクチャ

[設計書トップへ戻る](../DESIGN.md)

## 概要

Deno/TypeScript実装は`src/bridge`に集約する。
Chrome APIを直接実行する処理はChrome拡張側に置き、Deno側は中継、管理、MCP接続に集中する。

## 最終ゴール

DOM取得、ページ操作、Network/Performance/Memory取得などのAPIが増えても、transport層やChrome API呼び出し層にロジックが散らばらない構成にする。
メッセージ形式、エラー形式、設定、ツール定義を型として揃え、Deno bridgeと拡張の間で仕様ずれが起きにくい形にする。
Chrome実環境が必要な部分と、通常の単体テストで検証できる部分を分ける。

## Deno bridgeのディレクトリ方針

- `src/bridge/main.ts`: CLI entrypoint。引数なしでMCP stdio、`daemon`でlocalhost APIを起動する
- `src/bridge/mcp/tools.ts`: MCP tool名、input schema、tool実行の抽象I/Fを扱う
- `src/bridge/mcp/server.ts`: MCP stdio、MCP request/response変換を扱う
- `src/bridge/daemon/http_api.ts`: Bridge HTTP API、`/status`、`/tool/<toolName>`、互換用`/get-dom`、`/get-network`を扱う
- `src/bridge/daemon/browser_service.ts`: daemon内実行とMCP proxy実行を同じtool呼び出しI/Fに揃える
- `src/bridge/daemon/ws_bridge.ts`: WS待ち受け、client管理、ping/pong、timeoutを扱う
- `src/bridge/protocol/types.ts`: tool名、WS message、payload、error code、query/input型を定義する

## 起動モデル

引数なしの`bridge`はMCP stdioサーバーとして動き、Chrome拡張とは直接つながらず、`bridge daemon`のHTTP APIへproxyする。
`bridge daemon`は`127.0.0.1:9333`をlistenし、Chrome拡張のWebSocket接続とHTTP APIを担当する。
macOSではinstall scriptがLaunchAgentを登録し、`/Users/<user>/.local/bin/bridge daemon`として起動する。

Chrome拡張はMV3 service workerのライフサイクルにより、短時間に複数のWebSocket接続を残すことがある。
Deno bridge側は接続を1本に正規化しようとして古い接続を強制closeしない。
リクエストは接続中のWebSocketへbroadcastし、同じIDで最初に返ったレスポンスを採用する。

Chrome拡張パネルは接続状態表示に絞る。
拡張パネルはBridge起動やセットアップ実行を持たず、daemon、extension、active tabの状態を表示する。

## 現在の実装済み範囲

- `get_dom`: MCP、daemon HTTP、WS、Chrome拡張の経路で動作確認済み
- `get_network`: MCP、daemon HTTP、WS、Chrome拡張の経路で動作確認済み。`query`、`failedOnly`、`limit`、`includeHeaders`、`includeBodyPreview`、`maxPreviewBytes`を受け取り、`chrome.webRequest`履歴を検索する
- `get_console`: console/error/unhandledrejection履歴を取得する初期実装
- `click`、`fill`、`wait_for`、`navigate`: アクティブタブに対する基本操作
- Deno compileによるbinary生成: `bridge-darwin-amd64`、`bridge-darwin-arm64`
- Chrome拡張パネル: Bridge接続状態表示
- Bridge API起動: `bridge daemon`が`127.0.0.1:9333`をlistenする

## 次の実装対象

次は`get_network`のCDP連携を検討する。
`chrome.webRequest`だけではresponse body previewやCDP固有のfailed reasonを取れないため、必要になった段階で`chrome.debugger`を明示有効化する。

Network処理では、headers/body取得とredactionを混ぜない。
最低限以下を分ける。

- network event buffer
- network query/report formatter
- redaction policy
- protocol payload変換

## Deno Desktopの扱い

Deno Desktop 2.9.0のmacOS Intel環境では、最小`.app`でも`Could not find standalone binary section in dylib`で起動できない。
そのため本線から外し、検証用コードは`experiments/deno-desktop-minimal/`に隔離する。
Deno Desktop側が改善されたら、daemon方式を置き換えるか補助UIとして追加するか再検討する。

## 禁止する依存

- MCP tool handler内にDOM取得や操作の本体を書かない
- WS read/write loop内にツール固有の処理を書かない
- Chrome API実行ロジックをDeno bridge側に置かない
- protocol境界を越えて型なしpayloadを広げない

## Chrome拡張側

`extension/background.js`は、WS接続、keepalive、再接続、リクエスト振り分けだけを担当する。
ページに依存する処理はcontent scriptまたは`chrome.scripting.executeScript`側へ寄せる。
拡張パネルは接続状態だけを扱い、DOM取得や操作ロジックを持たない。

現在の分割:

- `active_tab.js`: アクティブタブ取得とtab metadata
- `dom_tools.js`: DOM取得
- `network_tools.js`: `chrome.webRequest`履歴
- `console_tools.js`: console履歴取得
- `console_capture.js`: isolated world側のconsole buffer
- `page_console_hook.js`: MAIN world側のconsole/error hook
- `action_tools.js`: click/fill/wait_for/navigate

## テスト方針

MCP request/response変換はDeno testで単体テストする。
HTTP/WebSocketはdaemon実行時のcurlと拡張接続で検証する。
Denoコード変更後は`deno fmt`、`deno task check`、`deno test`を必須にする。

## 残す検討項目

- Denoと拡張で共有するプロトコル仕様の管理方法
- Chrome実機テストの切り分け
