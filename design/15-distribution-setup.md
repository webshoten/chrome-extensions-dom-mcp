# 15. 配布とセットアップ

[設計書トップへ戻る](../DESIGN.md)

## 概要

`bridge`をDeno compileしたmacOS binaryとして配布し、install scriptで`~/.local/bin/bridge`へ配置する。
同じbinaryをMCP stdio用とdaemon用に使い、daemonはLaunchAgentで起動する。
Chrome拡張は当面ストアなしのLoad unpackedで導入する。

## 現在の配布物

GitHub Releasesに置く配布物:

- `bridge-darwin-amd64`
- `bridge-darwin-arm64`
- `install-macos.sh`

## 最終ゴール

セットアップは、binary配置、LaunchAgent登録、daemon起動、拡張導入、MCP登録までをなるべく自動化する。
拡張はLoad unpackedから始め、将来Chrome Web Storeへ移行できる設計にする。
Deno Desktopは改善された時点で、daemon方式を置き換えるか補助UIとして追加するか再検討する。

## 詳細化する項目

- macOS LaunchAgentの登録、更新、停止、再起動
- Chrome拡張のLoad unpacked導線
- `claude mcp add`登録手順
- Codex MCP登録手順
- OSごとの設定ファイル配置
