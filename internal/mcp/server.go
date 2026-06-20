package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// DOMGetter はMCPツール層へアクティブタブのDOMスナップショットを提供します。
type DOMGetter interface {
	GetDOM(ctx context.Context) ([]byte, error)
}

// Request はstdio MCPで使うJSON-RPCリクエスト形式です。
type Request struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id,omitempty"`
	Method  string           `json:"method"`
	Params  json.RawMessage  `json:"params,omitempty"`
}

// Response はstdio MCPで返すJSON-RPCレスポンス形式です。
type Response struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      *json.RawMessage `json:"id,omitempty"`
	Result  any              `json:"result,omitempty"`
	Error   *Error           `json:"error,omitempty"`
}

// Error はMCPクライアントへ返すJSON-RPCエラー形式です。
type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type toolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
}

// Run は入力から改行区切りのMCP JSON-RPCメッセージを読み、応答を出力へ書きます。
func Run(ctx context.Context, input io.Reader, output io.Writer, domGetter DOMGetter) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	encoder := json.NewEncoder(output)

	for scanner.Scan() {
		var request Request
		if err := json.Unmarshal(scanner.Bytes(), &request); err != nil {
			continue
		}
		if request.ID == nil {
			continue
		}

		response := HandleRequest(ctx, domGetter, request)
		if err := encoder.Encode(response); err != nil {
			return fmt.Errorf("write mcp response: %w", err)
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read mcp request: %w", err)
	}

	return nil
}

// HandleRequest は1件のMCP JSON-RPCリクエストをレスポンスへ変換します。
func HandleRequest(ctx context.Context, domGetter DOMGetter, request Request) Response {
	response := Response{
		JSONRPC: "2.0",
		ID:      request.ID,
	}

	switch request.Method {
	case "initialize":
		response.Result = map[string]any{
			"protocolVersion": "2025-06-18",
			"capabilities": map[string]any{
				"tools": map[string]any{
					"listChanged": false,
				},
			},
			"serverInfo": map[string]any{
				"name":    "chrome-dom-bridge",
				"version": "0.1.0",
			},
		}
	case "tools/list":
		response.Result = map[string]any{
			"tools": []map[string]any{
				{
					"name":        "get_dom",
					"description": "Capture the active Chrome tab DOM through the connected extension.",
					"inputSchema": map[string]any{
						"type":                 "object",
						"properties":           map[string]any{},
						"additionalProperties": false,
					},
				},
			},
		}
	case "tools/call":
		result, err := handleToolCall(ctx, domGetter, request.Params)
		if err != nil {
			response.Error = &Error{Code: -32000, Message: err.Error()}
			return response
		}
		response.Result = result
	default:
		response.Error = &Error{
			Code:    -32601,
			Message: fmt.Sprintf("method not found: %s", request.Method),
		}
	}

	return response
}

func handleToolCall(ctx context.Context, domGetter DOMGetter, rawParams json.RawMessage) (map[string]any, error) {
	var params toolCallParams
	if err := json.Unmarshal(rawParams, &params); err != nil {
		return nil, fmt.Errorf("parse tool call params: %w", err)
	}

	if params.Name != "get_dom" {
		return nil, fmt.Errorf("unknown tool: %s", params.Name)
	}

	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	payload, err := domGetter.GetDOM(requestCtx)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"content": []map[string]any{
			{
				"type": "text",
				"text": string(payload),
			},
		},
		"isError": false,
	}, nil
}
