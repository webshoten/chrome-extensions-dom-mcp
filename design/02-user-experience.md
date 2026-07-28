# 2. 想定ユーザー体験

[設計書トップへ戻る](../DESIGN.md)

## 概要

ユーザーは普段使いChromeを開き、AI Agentへ依頼するだけで現在タブを取得・操作できる。
別ブラウザ、Chromeプロファイル切り替え、ログインし直し、daemonコマンドを前提にしない。

## 対象環境

- OS: macOS
- ブラウザー: Chrome
- AI Agent: Codex、Claude Code

## 初回導入

1. `Bridge.app`をApplicationsへ入れて開く
2. Chrome拡張をLoad unpackedで導入する
3. Bridgeの「MCP導入」からAI Agentを追加する
4. 「ログイン時に起動」を有効にする

通常起動ではDockとUIを表示する。ウィンドウを閉じた後とログイン時起動では、メニューバーだけで継続する。
