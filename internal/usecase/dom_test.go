package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"chrome-extensions-dom-mcp/internal/protocol"
)

type fakeBrowserRequester struct {
	response protocol.Message
	err      error
	message  protocol.Message
}

func (f *fakeBrowserRequester) Request(ctx context.Context, message protocol.Message) (protocol.Message, error) {
	f.message = message
	return f.response, f.err
}

func TestDOMServiceGetDOMRequestsActiveTabDOM(t *testing.T) {
	payload := json.RawMessage(`{"title":"Example","html":"<html></html>"}`)
	browser := &fakeBrowserRequester{
		response: protocol.Message{
			ID:      "get-dom-1",
			Type:    "get_dom_result",
			Payload: payload,
		},
	}

	service := NewDOMService(browser)
	got, err := service.GetDOM(context.Background())
	if err != nil {
		t.Fatalf("GetDOM returned error: %v", err)
	}

	if string(got) != string(payload) {
		t.Fatalf("payload = %s, want %s", got, payload)
	}
	if browser.message.Type != "get_dom" {
		t.Fatalf("request type = %q, want get_dom", browser.message.Type)
	}
	if !strings.HasPrefix(browser.message.ID, "get-dom-") {
		t.Fatalf("request id = %q, want get-dom-*", browser.message.ID)
	}
}

func TestDOMServiceGetDOMReturnsTransportError(t *testing.T) {
	browser := &fakeBrowserRequester{
		err: errors.New("extension disconnected"),
	}

	service := NewDOMService(browser)
	_, err := service.GetDOM(context.Background())
	if err == nil {
		t.Fatal("GetDOM returned nil error")
	}
	if err.Error() != "extension disconnected" {
		t.Fatalf("error = %q, want extension disconnected", err.Error())
	}
}

func TestDOMServiceGetDOMReturnsExtensionError(t *testing.T) {
	browser := &fakeBrowserRequester{
		response: protocol.Message{
			Type: "error",
			Error: &protocol.MessageError{
				Code:    "DOM_CAPTURE_FAILED",
				Message: "cannot access tab",
			},
		},
	}

	service := NewDOMService(browser)
	_, err := service.GetDOM(context.Background())
	if err == nil {
		t.Fatal("GetDOM returned nil error")
	}
	if err.Error() != "DOM_CAPTURE_FAILED: cannot access tab" {
		t.Fatalf("error = %q, want DOM_CAPTURE_FAILED: cannot access tab", err.Error())
	}
}
