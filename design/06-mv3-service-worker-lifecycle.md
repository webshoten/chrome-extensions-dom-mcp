# 6. MV3 Service Worker 生存戦略

[設計書トップへ戻る](../DESIGN.md)

## 概要

MV3のbackground service workerはアイドル時に停止するため、WebSocket接続の維持と復帰を明示的に設計する。
Chrome 116以降ではWS上の送受信がservice workerのidle timerをリセットするため、20秒pingを基本にする。

## 最終ゴール

WS接続中は拡張から20秒ごとにpingを送り、Goヘルパーがpongを返す。
切断、service worker停止、Chrome再起動後も再接続でき、MCPリクエストを取りこぼさない構成にする。

## 詳細化する項目

- `minimum_chrome_version: "116"`の扱い
- ping/pong間隔と失敗判定
- `chrome.alarms`による復帰確認
- 未接続時のリクエスト待機とエラー
