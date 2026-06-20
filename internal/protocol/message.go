package protocol

import "encoding/json"

// Message はヘルパーとChrome拡張の間で共有するWebSocketメッセージです。
type Message struct {
	ID      string          `json:"id,omitempty"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Error   *MessageError   `json:"error,omitempty"`
}

// MessageError はChrome拡張側で起きた失敗をWebSocket経由で運ぶエラー情報です。
type MessageError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
