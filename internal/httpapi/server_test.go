package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyDOMGetterReturnsDaemonPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/get-dom" {
			t.Fatalf("path = %q, want /get-dom", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"title":"Example","html":"<html></html>"}`))
	}))
	defer server.Close()

	getter := NewProxyDOMGetter(server.URL)
	payload, err := getter.GetDOM(context.Background())
	if err != nil {
		t.Fatalf("GetDOM returned error: %v", err)
	}

	if string(payload) != `{"title":"Example","html":"<html></html>"}` {
		t.Fatalf("payload = %s", payload)
	}
}

func TestProxyDOMGetterReturnsDaemonError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "chrome extension is not connected", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	getter := NewProxyDOMGetter(server.URL)
	_, err := getter.GetDOM(context.Background())
	if err == nil {
		t.Fatal("GetDOM returned nil error")
	}
	if !strings.Contains(err.Error(), "chrome extension is not connected") {
		t.Fatalf("error = %q, want helper error", err.Error())
	}
}
