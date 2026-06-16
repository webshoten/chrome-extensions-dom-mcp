# 4. コンポーネント構成

[設計書トップへ戻る](../DESIGN.md)

## 概要

主要コンポーネントはGoヘルパー、Chrome拡張background service worker、ページ実行スクリプト、設定保存領域に分ける。
それぞれの責務を明確にし、MCP、WS、Chrome APIの境界を混ぜない。

## 最終ゴール

GoヘルパーはMCPとWS中継を担い、Chrome拡張はChrome内でしかできないDOM取得・操作・情報取得を担う。
設定や認証情報は、ヘルパー側と拡張側で安全に保持し、必要な項目だけ同期する。

## 詳細化する項目

- Goヘルパーのモジュール構成
- background service workerの役割
- content scriptと`chrome.scripting.executeScript`の使い分け
- 設定保存先と責務分担
