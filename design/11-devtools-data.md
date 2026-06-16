# 11. DevTools級情報取得

[設計書トップへ戻る](../DESIGN.md)

## 概要

DOMだけでなく、Network、Performance、Memoryなどの情報もClaudeから取得できるようにする。
ページ内API、Chrome拡張API、DevTools/CDPを段階的に使い分ける。

## 最終ゴール

通常利用では`performance` APIや`chrome.*` APIを中心に使い、必要な場合に`chrome.debugger`/CDPでDevTools級情報を取得する。
強力な権限が必要な機能は明示的な有効化とユーザー確認を前提にする。

## 詳細化する項目

- Network情報取得範囲
- Performance/Memory取得範囲
- `chrome.debugger`利用条件
- 取得情報のサイズと秘匿
