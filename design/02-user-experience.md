# 2. 想定ユーザー体験

[設計書トップへ戻る](../DESIGN.md)

## 概要

ユーザーは普段通りChromeでページを開き、AIに依頼するだけで現在タブのDOMやNetwork情報をMCP経由で取得できる。
別ブラウザ起動、Chromeプロファイル切り替え、ログインし直しを前提にしない。

## 対象環境

- OS: macOS
- ブラウザー: Chrome
- AI Agent: Codex、Claude

## 現在の体験

初回セットアップで`bridge` binaryを配置し、macOS LaunchAgentとして`bridge daemon`を登録する。
daemonは`127.0.0.1:9333`で起動し、Chrome拡張は`ws://127.0.0.1:9333/ws`へ接続する。
拡張パネルはdaemon、extension、active tabの接続状態だけを表示する。

## 最終ゴール

Chrome拡張を入れ、install scriptを1回実行すればMCPを使える状態にする。
通常利用では、ローカルサーバー起動、設定ファイル編集、認証トークン手入力、認証情報リセットを意識させない。
失敗時は「何が起きたか」と「何をすれば復旧できるか」をAIまたは拡張パネルから返す。

## 詳細化する項目

- Chrome拡張の配布方法
- 初回セットアップの流れ
- MCP登録をinstall scriptに含めるか
- 拡張パネルでの接続状態表示
- ペアリング、再接続、トークン再発行を意識させないUX
- Deno Desktop改善後にDesktop app導線へ移すか
