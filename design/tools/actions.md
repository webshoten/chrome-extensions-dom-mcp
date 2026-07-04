# 操作系tools

[操作系ツール設計へ戻る](../10-actions.md)

## 目的

操作系toolsの目的は、AIがMCP経由で現在のChromeタブを最小限操作できるようにすること。
デバッグ時に、ボタン押下、フォーム入力、表示待ち、URL遷移をAI自身が辿れるようにする。

## Tools

| tool | 入力 | 内容 |
| --- | --- | --- |
| `click` | `selector` または `text` | 要素をクリックする |
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

## 実装境界

```text
MCP click/fill/wait_for/navigate
  → bridge mcp
  → HTTP POST /tool/<toolName>
  → bridge daemon
  → WebSocket { type: "<toolName>", payload: input }
  → Chrome拡張 background service worker
  → chrome.scripting.executeScript または chrome.tabs.update
  → MCP response
```

操作本体は`extension/action_tools.js`に置く。
MCP層とdaemon層はtool名とpayloadを中継するだけにする。

## 現在の制限

- 対象はアクティブウィンドウのアクティブタブ。
- selector/text指定のみ。座標指定とアクセシビリティ指定は未実装。
- `navigate`は`http`/`https`だけ許可する。
- 重要操作の確認UIは未実装。
