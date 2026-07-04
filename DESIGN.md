# Chrome Bridge MCP — 設計書

## 1. 目的とスコープ

普段使いのChromeプロファイルをそのまま使い、AI Agentから現タブのDOM取得、Network確認、Console確認、ページ操作をできるようにする。
Chrome拡張API、ページ内API、必要に応じたDevTools/CDPを活用し、Chrome上で取得・操作できる能力をMCPから使えるようにする。
公開するAPIは段階的に増やせる設計にする。

詳細: [design/01-purpose-and-scope.md](design/01-purpose-and-scope.md)

## 2. 想定ユーザー体験

現在の本線はmacOS daemon方式にする。
ユーザーは初回セットアップで`bridge` binaryとLaunchAgentを入れ、普段はいつものChromeでページを開き、Codex/Claudeに依頼するだけでDOMやNetwork情報を取得できる。
Deno DesktopはIntel Macで`.app`起動できない既知問題があるため、改善されるまで将来対応にする。

詳細: [design/02-user-experience.md](design/02-user-experience.md)

## 3. 全体アーキテクチャ

構成は `AI ←stdio/MCP→ bridge mcp ←HTTP→ bridge daemon ←WebSocket→ Chrome拡張 → 対象ページ` とする。
AIは`bridge mcp`をMCP stdioサーバーとして起動する。
`bridge mcp`はAIとのMCP通信を担当し、localhostのdaemonへHTTPで問い合わせる。
`bridge daemon`は`127.0.0.1:9333`でHTTP APIとWebSocketを待ち受け、Chrome拡張からの接続を受ける。

詳細: [design/03-architecture.md](design/03-architecture.md)

## 4. コンポーネント構成

Deno bridgeはMCP処理を行う短命プロセスと、WS待ち受けを行うdaemonに分かれる。
Chrome拡張のbackground service workerはWS接続、keepalive、リクエスト振り分けを担当する。
content scriptまたは`chrome.scripting.executeScript`でページ内DOMへアクセスする。
拡張パネルは接続状態表示に絞る。

詳細: [design/04-components.md](design/04-components.md)

## 4.5 コードアーキテクチャ

Deno実装は`src/bridge`に集約し、MCP、HTTP API、WebSocket、protocolの責務を分ける。
Chrome APIを実行する処理はChrome拡張側に置き、Deno bridgeは中継と管理に集中する。
Denoコード変更後は`deno fmt`、`deno task check`、`deno test`を必須にする。

詳細: [design/code-architecture.md](design/code-architecture.md)

## 5. 通信設計

MCP stdioはCodex/Claudeと`bridge mcp`の外部インターフェースとして使う。
WebSocketは`bridge daemon`とChrome拡張の内部ブリッジとして使う。
メッセージには`id`、`type`、`payload`を持たせ、リクエストとレスポンスを対応付ける。
各リクエストにはタイムアウトを設け、拡張未応答のまま待ち続けない。

詳細: [design/05-communication.md](design/05-communication.md)

## 6. MV3 Service Worker 生存戦略

Chrome 116以降を前提にし、`manifest.json`に`minimum_chrome_version: "116"`を入れる。
WS接続後、拡張側から20秒ごとにpingを送り、`bridge daemon`はpongを返す。
WSが切れた場合は拡張側で再接続ループを走らせる。

詳細: [design/06-mv3-service-worker-lifecycle.md](design/06-mv3-service-worker-lifecycle.md)

## 7. WebSocketポートと接続管理

`bridge daemon`は既定で`127.0.0.1:9333`にbindする。
ポート衝突時はランダムポートへ退避せず、明確なエラーとして失敗させる。
MCPリクエスト時に拡張が未接続なら、短時間待ってから分かりやすいエラーを返す。

詳細: [design/07-websocket-connection.md](design/07-websocket-connection.md)

## 8. 認証とセキュリティ

WSはlocalhost限定で待ち受け、`0.0.0.0`にはbindしない。
拡張と`bridge daemon`間には認証トークンを入れ、他プロセスからの接続を拒否する。
Chrome拡張の権限は機能ごとに必要最小限へ分ける。

詳細: [design/08-security.md](design/08-security.md)

## 9. DOM取得設計

既定ではアクティブウィンドウのアクティブタブを対象にする。
DOMはHTML本文だけでなく、URL、title、取得時刻、サイズなどのメタ情報も含めて返す。
巨大なDOMはサイズ制限を設ける。

詳細: [design/09-dom-capture.md](design/09-dom-capture.md)

## 10. 操作系ツール設計

操作系はMCPツールとして`click`、`fill`、`wait_for`、`navigate`、将来の`screenshot`などを公開する。
要素指定はCSSセレクタを基本にし、必要に応じてテキスト、座標、アクセシビリティ情報も扱う。

詳細: [design/10-actions.md](design/10-actions.md)

## 11. DevTools級情報取得

現在の`get_network`は`chrome.webRequest`を使い、アクティブタブの直近Network履歴、redaction済みheaders、request body preview、GraphQL要約を検索できる。
`get_console`はconsole/error/unhandledrejectionの履歴を取得する。
今後はCDPが必要なresponse body preview、詳細timing、failed reasonへ段階的に広げる。
raw headers/raw body、WebSocket message、WebRTC通信本体などは返さない。

詳細: [design/11-devtools-data.md](design/11-devtools-data.md)

## 12. 設定設計

設定対象はポート、WS認証トークン、許可サイト、ログレベルなど。
daemon側は設定ファイルと環境変数をサポートし、Chrome拡張は接続に必要な最小設定だけを`chrome.storage`へ持つ。

詳細: [design/12-configuration.md](design/12-configuration.md)

## 13. エラー設計

エラーはAIがユーザーに説明しやすい形で返す。
代表例は、ポート使用中、daemon未起動、拡張未接続、対象タブなし、権限不足、タイムアウト、DOMサイズ超過。
復旧方法が明確なものは、メッセージ内に次の行動を含める。

詳細: [design/13-errors.md](design/13-errors.md)

## 14. ログとデバッグ

daemon、Chrome拡張、通信経路それぞれで、問題調査に必要なログを出す。
DOM本文やheaders/bodyなどの機微情報は原則ログに出さない。

詳細: [design/14-logging-debugging.md](design/14-logging-debugging.md)

## 15. 配布とセットアップ

bridgeはDeno compileでmacOS単体バイナリとして配布し、install scriptでLaunchAgentへ登録する。
Chrome拡張は当面Load unpackedで導入し、将来は正式配布も検討する。
MCP登録は`~/.local/bin/bridge`を指す形にする。

詳細: [design/15-distribution-setup.md](design/15-distribution-setup.md)

## 16. 開発フェーズ

フェーズ1は、Deno bridgeで既存のMCP/daemonインターフェースを再現する。
フェーズ2は、macOS daemon配布とLaunchAgent installを安定させる。
フェーズ3以降で`get_network`、`get_console`、操作系を広げる。
現在は`get_console`と基本操作系の初期実装まで進んでいる。

詳細: [design/16-development-phases.md](design/16-development-phases.md)

## 17. PoC計画

最初にDeno bridgeのWS待ち受けを作る。
次にMV3 service workerから接続し、20秒pingで生存確認する。
その後、切断時の再接続と拡張未接続時のエラーを確認する。
最後に`get_dom`と`get_network`をMCP経由で確認する。

詳細: [design/17-poc-plan.md](design/17-poc-plan.md)

## 18. 未決事項

複数ウィンドウ/複数プロファイル時の対象タブ選択、WS認証トークン、Chrome Web Store配布、Deno Desktop再検討時期は未決。

詳細: [design/18-open-questions.md](design/18-open-questions.md)
