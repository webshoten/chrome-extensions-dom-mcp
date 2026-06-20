package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

type fakeDOMGetter struct {
	payload []byte
	err     error
	called  bool
}

func (f *fakeDOMGetter) GetDOM(ctx context.Context) ([]byte, error) {
	f.called = true
	return f.payload, f.err
}

func jsonID(t *testing.T, raw string) *json.RawMessage {
	t.Helper()
	id := json.RawMessage(raw)
	return &id
}

func TestHandleRequestListsTools(t *testing.T) {
	response := HandleRequest(context.Background(), &fakeDOMGetter{}, Request{
		JSONRPC: "2.0",
		ID:      jsonID(t, `1`),
		Method:  "tools/list",
	})

	if response.Error != nil {
		t.Fatalf("response error = %v", response.Error)
	}

	result, ok := response.Result.(map[string]any)
	if !ok {
		t.Fatalf("result type = %T, want map[string]any", response.Result)
	}
	tools, ok := result["tools"].([]map[string]any)
	if !ok {
		t.Fatalf("tools type = %T, want []map[string]any", result["tools"])
	}
	if len(tools) != 1 || tools[0]["name"] != "get_dom" {
		t.Fatalf("tools = %#v, want get_dom", tools)
	}
}

func TestHandleRequestCallsGetDOMTool(t *testing.T) {
	domGetter := &fakeDOMGetter{payload: []byte(`{"html":"<html></html>"}`)}
	response := HandleRequest(context.Background(), domGetter, Request{
		JSONRPC: "2.0",
		ID:      jsonID(t, `2`),
		Method:  "tools/call",
		Params:  json.RawMessage(`{"name":"get_dom","arguments":{}}`),
	})

	if response.Error != nil {
		t.Fatalf("response error = %v", response.Error)
	}
	if !domGetter.called {
		t.Fatal("GetDOM was not called")
	}

	result, ok := response.Result.(map[string]any)
	if !ok {
		t.Fatalf("result type = %T, want map[string]any", response.Result)
	}
	content, ok := result["content"].([]map[string]any)
	if !ok {
		t.Fatalf("content type = %T, want []map[string]any", result["content"])
	}
	if got := content[0]["text"]; got != `{"html":"<html></html>"}` {
		t.Fatalf("content text = %q", got)
	}
}

func TestHandleRequestReturnsToolError(t *testing.T) {
	domGetter := &fakeDOMGetter{err: errors.New("chrome extension is not connected")}
	response := HandleRequest(context.Background(), domGetter, Request{
		JSONRPC: "2.0",
		ID:      jsonID(t, `3`),
		Method:  "tools/call",
		Params:  json.RawMessage(`{"name":"get_dom","arguments":{}}`),
	})

	if response.Error == nil {
		t.Fatal("response error was nil")
	}
	if response.Error.Code != -32000 {
		t.Fatalf("error code = %d, want -32000", response.Error.Code)
	}
	if response.Error.Message != "chrome extension is not connected" {
		t.Fatalf("error message = %q", response.Error.Message)
	}
}

func TestRunIgnoresNotifications(t *testing.T) {
	input := strings.NewReader(
		`{"jsonrpc":"2.0","method":"notifications/initialized"}` + "\n" +
			`{"jsonrpc":"2.0","id":1,"method":"tools/list"}` + "\n",
	)
	var output bytes.Buffer

	if err := Run(context.Background(), input, &output, &fakeDOMGetter{}); err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("response line count = %d, want 1; output = %q", len(lines), output.String())
	}
	if !strings.Contains(lines[0], `"id":1`) {
		t.Fatalf("response = %q, want id 1", lines[0])
	}
}
