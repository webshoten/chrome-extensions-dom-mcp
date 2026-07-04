# 11. DevTools級情報取得

[設計書トップへ戻る](../DESIGN.md)

## 概要

DOMだけでなく、Network、Console、Performance、Memory、RTCなどの情報もMCPから取得できるようにする。
各toolのI/Fはtool単位の設計書に分ける。

## 基本方針

DevToolsの完全再現ではなく、AIがMCP toolを使ってデバッグ判断できることを優先する。
特にNetworkとConsoleは、バグ原因の切り分けに直結するため優先して扱う。

情報取得は段階的に深くする。

```text
N1: ページ内API
  performance APIなど、比較的安全に取れる情報。

N2: Chrome拡張API
  webRequestなど、拡張が観測できるブラウザイベント。

N3: DevTools/CDP
  chrome.debugger / CDPを使う深い情報。
  権限が強く、明示的な有効化を前提にする。
```

通常利用はN1/N2を中心にする。
N3はresponse body、詳細timing、CDP固有のfailed reasonなどが必要になった場合だけ使う。

現在の`get_network`はN2として実装する。
`chrome.webRequest`でrequest/response headers、request body preview、status/error、GraphQL要約を扱う。
response body previewはN3が必要になるため、現時点では`bodyUnavailableReason: "requires_cdp"`として返す。

## Tool別設計

- [get_dom](tools/get-dom.md)
- [get_network](tools/get-network.md)
- [get_console](tools/get-console.md)
- [操作系tools](tools/actions.md)

今後追加するtool:

- `get_rtc_stats`
- `get_performance`

## セキュリティ方針

Network、Console、DOMには個人情報、認証情報、業務情報が含まれ得る。
AIへ渡す前に、必要に応じてredaction、preview制限、binary除外、ログ抑制を行う。

Networkのheaders/bodyはrawでは返さない。
詳細は [get_network](tools/get-network.md) に定義する。

## 残す検討項目

- `get_rtc_stats`のI/F
- `chrome.debugger`利用時のユーザー確認UI
- Performance/Memory取得範囲
