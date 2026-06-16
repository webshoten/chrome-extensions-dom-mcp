# 9. DOM取得設計

[設計書トップへ戻る](../DESIGN.md)

## 概要

Claudeからの`get_dom`要求に対して、Chrome拡張が対象タブのDOMとメタ情報を取得して返す。
取得結果はClaudeがページ理解や次の操作判断に使える形にする。

## 最終ゴール

既定ではアクティブウィンドウのアクティブタブを対象にし、HTML、URL、title、取得時刻、サイズなどを返す。
iframe、Shadow DOM、script/style、巨大DOM、非表示要素をどう扱うかを仕様として定義する。

## 詳細化する項目

- 対象タブの決定方法
- 返却JSON形式
- サイズ制限と切り詰め
- iframe/Shadow DOM対応
