# Chrome DOM Bridge MCP — 設計書

## 1. 目的とスコープ

普段使いのChromeプロファイルをそのまま使い、Claudeから現タブのDOM取得やページ操作をできるようにする。
Chrome拡張API、ページ内API、必要に応じたDevTools/CDPを最大限活用し、Chrome上で取得・操作できる能力をMCPから使えるようにする。
対象はChrome拡張、Goヘルパー、MCP連携、DOM取得、ページ操作、Network/Performance/Memoryなどの情報取得まで含める。
最終的には、普段使いのChromeをClaudeから広く扱える万能ブラウザ操作・情報取得MCPを目指す。
公開するAPIは段階的に増やせる設計にする。

詳細: [design/01-purpose-and-scope.md](design/01-purpose-and-scope.md)

## 2. 想定ユーザー体験

理想は、ユーザーがChrome拡張を入れ、最初の簡単な案内に従うだけでMCPを使える状態にすること。
普段はいつものChromeでページを開き、Claudeに「今のページを見て」と頼むだけにする。
ユーザーがGoヘルパー、ローカルサーバー、認証トークン、Chromeプロファイル変更を意識しない形にする。
失敗時も、設定ファイル編集や認証情報リセットを前提にせず、拡張側の案内で自然に復旧できるようにする。

詳細: [design/02-user-experience.md](design/02-user-experience.md)

## 3. 全体アーキテクチャ

構成は `Claude ←stdio/MCP→ Goヘルパー ←WebSocket→ Chrome拡張 → 対象ページ` とする。
ClaudeはGoヘルパーをMCP stdioサーバーとして起動する。
GoヘルパーはlocalhostでWSを待ち受け、Chrome拡張からの接続を受ける。
Chrome拡張は対象タブにスクリプトを注入し、DOM取得や操作を実行する。

詳細: [design/03-architecture.md](design/03-architecture.md)

## 4. コンポーネント構成

GoヘルパーはMCP処理、WS待ち受け、拡張へのリクエスト中継を担当する。
Chrome拡張のbackground service workerはWS接続、keepalive、リクエスト振り分けを担当する。
content scriptまたは`chrome.scripting.executeScript`でページ内DOMへアクセスする。
設定はヘルパー側設定と拡張側設定に分かれるため、同期方法を明確にする。

詳細: [design/04-components.md](design/04-components.md)

## 4.5 コードアーキテクチャ

Go実装では Cursor Rule `/.cursor/rules/go-helper-standards.mdc` を必須ルールとして扱う。
Goヘルパーは `cmd/dom-bridge`、`internal/mcp`、`internal/ws`、`internal/usecase`、`internal/protocol`、`internal/config` に分ける。
`internal/usecase` からMCP/WSをimportせず、MCP handlerやWS loopにツール固有ロジックを書かない。
Goコード変更後は `gofmt` と `go test ./...` を必須にする。

詳細: [design/code-architecture.md](design/code-architecture.md)

## 5. 通信設計

MCP stdioはClaudeとGoヘルパーの外部インターフェースとして使う。
WebSocketはGoヘルパーとChrome拡張の内部ブリッジとして使う。
メッセージには`id`、`type`、`payload`を持たせ、リクエストとレスポンスを対応付ける。
各リクエストにはタイムアウトを設け、拡張未応答のまま待ち続けない。

詳細: [design/05-communication.md](design/05-communication.md)

## 6. MV3 Service Worker 生存戦略

Chrome 116以降を前提にし、`manifest.json`に`minimum_chrome_version: "116"`を入れる。
WS接続後、拡張側から20秒ごとにpingを送り、Goヘルパーはpongを返す。
WSが切れた場合は拡張側で再接続ループを走らせる。
`chrome.alarms`も使い、service worker停止後の復帰と再接続を担保する。
この生存戦略はDOM取得、操作、DevTools級情報取得すべての土台として扱う。

詳細: [design/06-mv3-service-worker-lifecycle.md](design/06-mv3-service-worker-lifecycle.md)

## 7. WebSocketポートと接続管理

Goヘルパーは既定で`127.0.0.1:9333`にWSをbindする。
ポート衝突時はランダムポートへ退避せず、明確なエラーとして失敗させる。
ポートは設定ファイルまたは環境変数で変更できるようにする。
拡張側にも同じポート設定を持たせる。
MCPリクエスト時に拡張が未接続なら、短時間待ってから分かりやすいエラーを返す。

詳細: [design/07-websocket-connection.md](design/07-websocket-connection.md)

## 8. 認証とセキュリティ

WSはlocalhost限定で待ち受け、`0.0.0.0`にはbindしない。
拡張とGoヘルパー間には認証トークンを入れ、他プロセスからの接続を拒否する。
Chrome拡張の権限は機能ごとに必要最小限へ分け、過大な権限要求を避ける。
DOMには個人情報や社外秘が含まれ得るため、対象サイト制限や除外ルールを設計する。

詳細: [design/08-security.md](design/08-security.md)

## 9. DOM取得設計

既定ではアクティブウィンドウのアクティブタブを対象にする。
DOMはHTML本文だけでなく、URL、title、取得時刻、サイズなどのメタ情報も含めて返す。
巨大なDOMはサイズ制限を設け、超過時の扱いをエラーまたは切り詰めとして定義する。
iframe、Shadow DOM、script/style除外などの扱いを仕様として明確にする。

詳細: [design/09-dom-capture.md](design/09-dom-capture.md)

## 10. 操作系ツール設計

操作系はMCPツールとして`click`、`fill`、`navigate`、`screenshot`などを公開する。
要素指定はCSSセレクタを基本にし、必要に応じてテキスト、座標、アクセシビリティ情報も扱う。
`fill`ではReact/Vue等を考慮し、`input`や`change`イベント発火が必要になる。
複数ステップ操作に備え、待機、リトライ、失敗理由、操作前確認の方針を定義する。

詳細: [design/10-actions.md](design/10-actions.md)

## 11. DevTools級情報取得

情報取得は3段階で考える。
層1はページ内`performance` APIで、軽く安全に取れる範囲を扱う。
層2は`chrome.webRequest`などのChrome拡張APIを使う。
層3は`chrome.debugger`/CDPで、強力だが権限とデバッグ中表示のリスクがある。
通常利用は層1〜2を中心にし、層3は明示的に有効化された場合だけ使う。

詳細: [design/11-devtools-data.md](design/11-devtools-data.md)

## 12. 設定設計

設定対象はポート、WS認証トークン、許可サイト、ログレベルなど。
Goヘルパー側は設定ファイルと環境変数で設定できるようにする。
Chrome拡張側は`chrome.storage`と簡単な設定画面を使う。
ヘルパー側と拡張側でポートやトークンがずれた時の案内を設計する。

詳細: [design/12-configuration.md](design/12-configuration.md)

## 13. エラー設計

エラーはClaudeがユーザーに説明しやすい形で返す。
代表例は、ポート使用中、拡張未接続、対象タブなし、権限不足、タイムアウト、DOMサイズ超過。
内部エラーコードと人間向けメッセージを分ける。
復旧方法が明確なものは、メッセージ内に次の行動を含める。

詳細: [design/13-errors.md](design/13-errors.md)

## 14. ログとデバッグ

Goヘルパーは起動、WS接続、MCPツール呼び出し、エラーをログに出す。
Chrome拡張は接続状態、ping/pong、再接続、DOM取得失敗を確認できるようにする。
DOM本文や入力値などの機微情報は原則ログに出さない。
ログは問題調査に必要な最小限のメタ情報を中心にし、プライバシーを優先する。

詳細: [design/14-logging-debugging.md](design/14-logging-debugging.md)

## 15. 配布とセットアップ

ヘルパーはGoで単体バイナリとして配布する。
macOS、Windows、Linux向けに配布できる形にする。
Chrome拡張は手動読込と正式配布の両方を想定する。
Claudeへの登録は`claude mcp add dom-bridge /path/to/helper`を想定する。
セットアップは「ファイル配置、拡張導入、MCP登録」をなるべく自動化する。

詳細: [design/15-distribution-setup.md](design/15-distribution-setup.md)

## 16. 開発フェーズ

フェーズ1は、GoヘルパーとChrome拡張をWebSocketで接続し、MV3 service workerの生存戦略を確認する。
フェーズ2は、アクティブタブから`get_dom`を取得し、Goヘルパー経由で返せるようにする。
フェーズ3は、GoヘルパーをMCP stdioサーバーとしてClaudeから呼べるようにする。
フェーズ4は、`click`、`fill`、`navigate`などの操作系を追加する。
フェーズ5は、設定UI、認証、配布、DevTools級情報取得を必要に応じて整える。

詳細: [design/16-development-phases.md](design/16-development-phases.md)

## 17. PoC計画

最初にGoヘルパーのWS待ち受けを作る。
次にMV3 service workerから接続し、20秒pingで生存確認する。
その後、切断時の再接続と拡張未接続時のエラーを確認する。
最後に`get_dom`を実装し、Claude/MCP接続へ進む。
成功条件は、30秒以上放置しても接続が維持または自動復旧し、DOM取得が成功すること。

詳細: [design/17-poc-plan.md](design/17-poc-plan.md)

## 18. 未決事項

複数ウィンドウ/複数プロファイル時の対象タブ選択は未決。
DOMの最大サイズ、切り詰め方、script/style除外方針は未決。
WS認証トークンの生成、保存、初回共有方法は未決。
操作系にユーザー確認を挟むかどうかは未決。
Chrome Web Store配布を目指すか、個人利用前提にするかは未決。

詳細: [design/18-open-questions.md](design/18-open-questions.md)
