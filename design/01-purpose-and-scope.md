# 1. 目的とスコープ

[設計書トップへ戻る](../DESIGN.md)

## 概要

普段使いのChromeプロファイルをそのまま使い、Claudeから現タブのDOM取得、ページ操作、情報取得をできるようにする。
Chrome拡張API、ページ内API、DevTools/CDPを最大限活用し、Chrome上で可能な操作と観測をMCPツールとして公開する。

## 最終ゴール

普段使いのChromeをClaudeから広く扱える、万能ブラウザ操作・情報取得MCPを目指す。
DOM、クリック、入力、遷移、スクリーンショット、Network、Performance、Memoryなどを段階的に扱える設計にする。

## 詳細化する項目

- MCPから公開する機能範囲
- Chrome拡張APIとDevTools/CDPの利用範囲
- やらないことではなく、最終的に届きたい能力の定義
