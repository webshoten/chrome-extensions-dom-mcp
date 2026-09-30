# Chrome Bridge MCP

普段使いのChromeをそのまま使い、CodexやClaude Codeから現在タブを取得・操作するmacOS Desktop appです。

## 利用方法

1. `Bridge.app`をApplicationsへ入れて開く
2. Chrome拡張をLoad unpackedで読み込む
3. Bridgeの「MCP導入」でCodexまたはClaude Codeを追加する

以後はmacOSログイン時にBridgeがメニューバーで起動します。通常利用でコマンド操作は不要です。

```text
Codex / Claude Code
  ↕ Streamable HTTP MCP :9333/mcp
Bridge.app
  ↕ WebSocket :9333/ws
Chrome拡張
  ↕ Chrome API / 将来のCDP
現在のChromeタブ
```

## MCP tools

- `list_tabs`: 開いているChrome window/tabと一時的な`targetId`を取得する
- `get_dom`: `targetId`で指定したタブ、または現在タブのDOMを取得する
- `get_network`: Network履歴を検索する
- `get_console`: Consoleとページエラーを取得する
- `click`: 要素をクリックする
- `double_click`: `targetId`で指定したタブの要素または座標をダブルクリックする
- `drag`: `targetId`で指定したタブをドラッグする。Shift/Command等のmodifier併用にも対応
- `fill`: 入力要素へ値を入れる
- `wait_for`: 要素またはテキストを待つ
- `navigate`: 現在タブを遷移する

## 開発

Deno 2.9.7以上を使用します。

```bash
deno task check
deno task test
deno task desktop:dev
```

macOS appを生成します。

```bash
deno task build:macos
open dist/Bridge.app
```

開発時の状態確認:

```bash
curl http://127.0.0.1:9333/status
```

通常ユーザーがこれらのコマンドを実行することはありません。
