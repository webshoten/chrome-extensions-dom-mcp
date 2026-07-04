# Chrome Bridge MCP

普段使いのChromeをそのまま使い、Codex/Claudeから現在タブのDOMやNetwork情報を取得するMCPです。

## 起動モデル

現在の本線はdaemon方式です。Deno DesktopはIntel Macで`.app`起動できない既知問題があるため、改善されるまで採用保留にします。

```text
Chrome拡張 ←WebSocket→ bridge daemon :9333 ←HTTP→ bridge mcp ←stdio/MCP→ Codex/Claude
```

- `bridge daemon`: `127.0.0.1:9333`でHTTP APIとWebSocketを待ち受ける常駐プロセス
- `bridge mcp`: MCP stdioサーバーとして動き、daemonのHTTP APIへproxyする
- Chrome拡張: `ws://127.0.0.1:9333/ws`へ接続し、DOM/Network/Console取得と基本操作をChrome内で実行する

通常のMCP登録では引数なしの`bridge`が起動し、MCPモードになります。
daemonはmacOS LaunchAgentで起動します。

## MCP tools

現在公開しているtool:

- `get_dom`: アクティブタブのDOMを取得する
- `get_network`: アクティブタブの直近Network履歴、redaction済みheaders/body preview、GraphQL要約を検索する
- `get_console`: アクティブタブのconsole/error/unhandledrejection履歴を取得する
- `click`: selectorまたは表示テキストでクリックする
- `fill`: 入力要素へ値を入れる
- `wait_for`: selectorまたは表示テキストを待つ
- `navigate`: アクティブタブをURLへ遷移する

## 開発

```bash
deno --version
deno task check
deno test
node --check extension/background.js
node --check extension/popup.js
```

daemonを直接起動する場合:

```bash
deno task daemon:dev
```

確認:

```bash
curl http://127.0.0.1:9333/status
```

## macOS配布

macOS向けの配布物はDeno compileで生成します。

```bash
scripts/build-release-macos.sh
```

生成物:

```text
dist/bridge-darwin-amd64
dist/bridge-darwin-arm64
dist/install-macos.sh
```

ローカルのビルド結果をそのままinstallする場合:

```bash
scripts/install-local-macos.sh
```

公開後、ユーザーは以下で最新版をインストール・更新できます。

```bash
curl -fsSL https://github.com/webshoten/chrome-extensions-dom-mcp/releases/latest/download/install-macos.sh | bash
```

このinstallは`~/.local/bin/bridge`を配置し、`~/Library/LaunchAgents/com.webshoten.bridge.plist`を登録してdaemonを起動します。

## daemon操作

```bash
curl http://127.0.0.1:9333/status
launchctl kickstart -k gui/$(id -u)/com.webshoten.bridge
launchctl kill TERM gui/$(id -u)/com.webshoten.bridge
```

## Deno Desktopについて

Deno Desktop 2.9.0のmacOS Intel環境では、最小アプリでも`Could not find standalone binary section in dylib`で`.app`起動できない既知問題があります。
検証用コードは`experiments/deno-desktop-minimal/`に残し、Deno Desktop側が改善されたら再検討します。
