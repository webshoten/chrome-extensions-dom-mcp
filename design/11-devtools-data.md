# 11. DevTools級情報取得

[設計書トップへ戻る](../DESIGN.md)

## 概要

DOMだけでなく、Network、Performance、Memoryなどの情報もClaudeから取得できるようにする。
ページ内API、Chrome拡張API、DevTools/CDPを段階的に使い分ける。

## 最終ゴール

通常利用では`performance` APIや`chrome.*` APIを中心に使い、必要な場合に`chrome.debugger`/CDPでDevTools級情報を取得する。
強力な権限が必要な機能は明示的な有効化とユーザー確認を前提にする。

## 現在の次フェーズ: get_network

最初に追加するNetwork系ツールは`get_network`とする。
対象はアクティブタブで、Chrome拡張が`chrome.scripting.executeScript`を使い、ページ内で`performance.getEntriesByType("resource")`を実行する。
返す情報は、URL、initiatorType、transferSize、encodedBodySize、decodedBodySize、startTime、durationなどのresource timingに限定する。

この層では以下は取得しない。

- HTTP status code
- request/response header
- request/response body
- fetch/XHRの詳細な失敗理由
- service worker内部の詳細

これらは`chrome.webRequest`または`chrome.debugger`/CDPが必要になるため、後続フェーズで扱う。

## API方針

MCP tool名は`get_network`とする。
引数なしで現在のアクティブタブのresource timing一覧を返す。
巨大なページでは件数が多くなるため、初期実装では最新または先頭から一定件数へ制限するか、payloadサイズ上限を設ける。
件数制限を入れる場合も、URL、title、capturedAt、totalCount、returnedCountをメタ情報として返す。

## セキュリティとプライバシー

Network URLにはクエリパラメータや識別子が含まれる可能性がある。
初期実装ではbodyやheaderを扱わないことで危険度を抑える。
将来的には除外ドメイン、URLクエリのredaction、許可サイト設定を追加する。

## 詳細化する項目

- Network情報取得範囲
- Performance/Memory取得範囲
- `chrome.debugger`利用条件
- 取得情報のサイズと秘匿
