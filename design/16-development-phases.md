# 16. 開発フェーズ

[設計書トップへ戻る](../DESIGN.md)

## 概要

この章だけは最終ゴールではなく、実装の順序を扱う。
設計章に時系列を混ぜないため、段階的に作る内容はここへ集約する。

## フェーズ

フェーズ1は、Deno bridgeで既存のMCP/daemonインターフェースを再現する。現在は`src/bridge`でMCP、HTTP API、WebSocketの最小実装済み。
フェーズ2は、macOS向けDeno compile配布物とLaunchAgent installを安定させる。`bridge-darwin-amd64`、`bridge-darwin-arm64`、`install-macos.sh`を生成する。
フェーズ3は、`get_network`をAI向けNetworkデバッグレポートへ広げる。現在はredaction済みheaders、request body preview、GraphQL要約、横断検索、サイズ制限まで初期実装済み。
フェーズ4は、`get_console`を追加する。console/error/unhandledrejectionの初期取得は実装済み。
フェーズ5は、`chrome.webRequest`の追加オプションまたは`chrome.debugger`を使い、Networkのresponse bodyや詳細timingへ段階的に広げる。
フェーズ6は、`get_rtc_stats`を検討する。WebRTCは`get_network`では直接見えないため、`RTCPeerConnection.getStats()`由来の別ツールにする。
フェーズ7は、`click`、`fill`、`navigate`などの操作系を追加する。現在は`click`、`fill`、`wait_for`、`navigate`の初期実装済み。
フェーズ8は、設定UI、認証、配布、DevTools級情報取得を整える。
フェーズ9は、Deno DesktopがmacOS Intelで安定した時点でDesktop app導線を再検討する。
