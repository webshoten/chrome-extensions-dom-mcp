# 15. 配布とセットアップ

[設計書トップへ戻る](../DESIGN.md)

## 配布物

macOS向け`Bridge.app`をDeno Desktopで生成し、最終的にDMGで配布する。
Chrome拡張は当面Load unpacked、将来はChrome Web Storeを検討する。

## 初回設定

Bridge UIから次を行う。

- Codexへ`http://127.0.0.1:9333/mcp`を登録
- Claude Codeへ同じMCP URLをuser scopeで登録
- macOSログイン時にBridge.appをバックグラウンド起動

CLI binary、daemon起動コマンド、旧daemon用LaunchAgent installerは配布しない。
