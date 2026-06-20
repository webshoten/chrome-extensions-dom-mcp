package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"chrome-extensions-dom-mcp/internal/usecase"
)

type StatusProvider interface {
	ClientCount() int
}

// DOMServer はChrome拡張へつながるprimary helperのHTTP APIを公開します。
type DOMServer struct {
	addr      string
	domGetter *usecase.DOMService
	wsHandler http.HandlerFunc
	status    StatusProvider
}

// NewDOMServer はHTTP APIとWebSocket endpointを同じlocalhostポートへまとめます。
func NewDOMServer(addr string, domGetter *usecase.DOMService, wsHandler http.HandlerFunc, status StatusProvider) *DOMServer {
	return &DOMServer{
		addr:      addr,
		domGetter: domGetter,
		wsHandler: wsHandler,
		status:    status,
	}
}

// ListenAndServe はdaemonとしてChrome拡張向けHTTP/WebSocket APIを公開します。
func (s *DOMServer) ListenAndServe() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/get-dom", s.handleGetDOM)
	mux.HandleFunc("/ws", s.wsHandler)

	log.Printf("dom-bridge helper listening on http://%s", s.addr)
	return http.ListenAndServe(s.addr, mux)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "ok")
}

func (s *DOMServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":                   true,
		"extensionConnections": s.status.ClientCount(),
	})
}

func (s *DOMServer) handleGetDOM(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	payload, err := s.domGetter.GetDOM(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(payload)
}

// ProxyDOMGetter はMCPプロセスからdaemonの/get-domへ要求を中継します。
type ProxyDOMGetter struct {
	baseURL string
	client  *http.Client
}

// NewProxyDOMGetter はdaemonへ接続するDOM取得口を作ります。
func NewProxyDOMGetter(baseURL string) *ProxyDOMGetter {
	return &ProxyDOMGetter{
		baseURL: baseURL,
		client:  http.DefaultClient,
	}
}

// GetDOM はdaemonのHTTP APIを呼び、MCP層へDOM payloadを返します。
func (g *ProxyDOMGetter) GetDOM(ctx context.Context) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.baseURL+"/get-dom", nil)
	if err != nil {
		return nil, fmt.Errorf("build proxy get-dom request: %w", err)
	}

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("daemon is not running or not reachable: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read proxy get-dom response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s", body)
	}

	return body, nil
}
