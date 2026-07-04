# Project Agent Instructions

## Explanation Style

コードや設計を説明するときは、以下の3つを対応づけて説明する。

- ユーザーの挙動: ユーザー、AI Agent、Chrome拡張、daemonが何をするか。概要だけでなく、実際に叩くコマンド、tool名、URL、message typeなどの値も示す
- インターフェース: 実際のrequest/response。CLI引数、MCP request/response、HTTP request/response、WebSocket request/response、Chrome APIの呼び出しと返り値など
- ソースコード: 対応する関数、package、file、処理の流れ

説明は、先にユーザーの挙動を「概要」と「実際の値」で示し、そのあとインターフェース、最後にソースコードの中身を説明する。
