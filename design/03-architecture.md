# 3. 全体アーキテクチャ

[設計書トップへ戻る](../DESIGN.md)

## 概要

`Bridge.app`はDesktop UI、Streamable HTTP MCP、Chrome拡張接続を同じプロセスで提供する。
Chrome内でしか実行できない処理はChrome拡張が担当する。

```mermaid
flowchart LR
  AI[AI Agent<br/>Codex / Claude Code]
  APP[Bridge.app<br/>Desktop UI / MCP / 状態管理]
  EXT[Chrome Extension<br/>Chrome API / CDP adapter]
  PAGE[Active Chrome Tab]

  AI <-->|Streamable HTTP MCP<br/>127.0.0.1:9333/mcp| APP
  APP <-->|WebSocket<br/>127.0.0.1:9333/ws| EXT
  EXT <-->|Chrome API / CDP| PAGE
```

Bridge.appを終了するとMCPとWebSocketも停止する。ウィンドウを閉じただけの場合はメニューバーで継続する。
