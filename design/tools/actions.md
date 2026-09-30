# 操作系tools

[操作系ツール設計へ戻る](../10-actions.md)

## 目的

操作系toolsの目的は、AIがMCP経由で現在のChromeタブを最小限操作できるようにすること。
デバッグ時に、ボタン押下、フォーム入力、表示待ち、URL遷移をAI自身が辿れるようにする。

## Tools

| tool | 入力 | 内容 |
| --- | --- | --- |
| `click` | `selector` または `text` | 要素をクリックする |
| `double_click` | `targetId`、`selector`、`text`、または座標 | 指定タブの要素またはviewport座標をダブルクリックする |
| `drag` | `targetId`、`source`、`destination`、任意の`modifiers` | 指定タブの要素またはviewport座標間をドラッグする |
| `fill` | `selector` または `text`、`value` | 入力要素へ値を入れる |
| `wait_for` | `selector` または `text`、`state`、`timeoutMs` | 要素やテキストを待つ |
| `navigate` | `url` | アクティブタブを遷移する |

例:

```json
{
  "selector": "button[type=submit]"
}
```

```json
{
  "text": "ログイン",
  "exact": true
}
```

座標をCommandキーとともにダブルクリック:

```json
{
  "targetId": "page:browser-550e8400-e29b-41d4-a716-446655440000:42",
  "x": 480,
  "y": 260,
  "modifiers": ["Meta"],
  "intervalMs": 80
}
```

通常のドラッグ:

```json
{
  "targetId": "page:browser-550e8400-e29b-41d4-a716-446655440000:42",
  "source": { "selector": "[data-card-id='42']" },
  "destination": { "selector": "[data-column='done']" }
}
```

Shiftキーを押しながら座標間をドラッグ:

```json
{
  "targetId": "page:browser-550e8400-e29b-41d4-a716-446655440000:42",
  "source": { "x": 240, "y": 320 },
  "destination": { "x": 640, "y": 320 },
  "modifiers": ["Shift"],
  "durationMs": 800,
  "steps": 20
}
```

`modifiers`は`Alt`、`Control`、`Meta`、`Shift`に対応する。macOSのCommandキーは`Meta`を指定する。

## 実装境界

```text
MCP click/double_click/drag/fill/wait_for/navigate
  → bridge mcp
  → HTTP POST /tool/<toolName>
  → bridge daemon
  → WebSocket { type: "<toolName>", payload: input }
  → Chrome拡張 background service worker
  → chrome.scripting.executeScript / chrome.debugger または chrome.tabs.update
  → MCP response
```

通常操作は`extension/action_tools.js`、CDP dragは`extension/drag_tools.js`に置く。
MCP層とdaemon層はtool名とpayloadを中継するだけにする。

## 現在の制限

- `double_click`と`drag`は`list_tabs`の`targetId`を必須とし、対象タブとChrome profileを固定する。
- その他の操作系toolはアクティブウィンドウのアクティブタブを対象にする。
- `click`、`fill`、`wait_for`はselector/text指定のみ。`double_click`と`drag`はviewport座標も指定できる。
- `double_click`はPointerEvent、MouseEvent、KeyboardEventをページ内で合成する。`isTrusted`を要求するサイトでは反応しない場合がある。
- `drag`は`chrome.debugger`からCDP `Input.dispatchMouseEvent`と`Input.dispatchKeyEvent`を送り、操作終了時にdetachする。DevTools等が同じタブへ接続中の場合はattachに失敗する。
- `drag`でもOSの実マウスポインターは移動しない。
- `navigate`は`http`/`https`だけ許可する。
- 重要操作の確認UIは未実装。
