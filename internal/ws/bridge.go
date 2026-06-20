package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"chrome-extensions-dom-mcp/internal/protocol"

	"github.com/gorilla/websocket"
)

// Bridge はChrome拡張とのWebSocket接続と返信待ちリクエストを管理します。
type Bridge struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]struct{}
	writeMu sync.Mutex
	pending map[string]chan protocol.Message
}

// NewBridge は未接続状態のWebSocketブリッジを作ります。
func NewBridge() *Bridge {
	return &Bridge{
		clients: make(map[*websocket.Conn]struct{}),
		pending: make(map[string]chan protocol.Message),
	}
}

// ClientCount は現在接続中のChrome拡張WebSocket数を返します。
func (b *Bridge) ClientCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.clients)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return r.Host == "127.0.0.1:9333"
	},
}

// HandleWebSocket はChrome拡張からのWebSocket接続を受け付けます。
func (b *Bridge) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade websocket: %v", err)
		return
	}

	b.addClient(conn)
	defer func() {
		b.removeClient(conn)
		conn.Close()
	}()

	log.Println("websocket connected")
	for {
		_, rawMessage, err := conn.ReadMessage()
		if err != nil {
			log.Printf("read websocket message: %v", err)
			return
		}
		var message protocol.Message
		err = json.Unmarshal(rawMessage, &message)
		if err != nil {
			log.Printf("parse json message: %v", err)
			continue
		}

		log.Printf("received message type: %s", message.Type)
		if message.Type == "ping" {
			response := protocol.Message{
				ID:   message.ID,
				Type: "pong",
			}
			if err := b.writeJSON(conn, response); err != nil {
				log.Printf("write websocket message: %v", err)
				return
			}
			continue
		}

		if b.resolvePending(message) {
			continue
		}
	}
}

// Request はChrome拡張へ1件のメッセージを送り、同じIDを持つ返信を待ちます。
func (b *Bridge) Request(ctx context.Context, message protocol.Message) (protocol.Message, error) {
	b.mu.Lock()
	clients := make([]*websocket.Conn, 0, len(b.clients))
	for client := range b.clients {
		clients = append(clients, client)
	}
	if len(clients) == 0 {
		b.mu.Unlock()
		return protocol.Message{}, fmt.Errorf("chrome extension is not connected")
	}

	responseCh := make(chan protocol.Message, 1)
	b.pending[message.ID] = responseCh
	b.mu.Unlock()

	defer b.forgetPending(message.ID)

	if err := b.writeJSONToAny(clients, message); err != nil {
		return protocol.Message{}, err
	}

	select {
	case response := <-responseCh:
		return response, nil
	case <-ctx.Done():
		return protocol.Message{}, fmt.Errorf("wait for chrome extension response: %w", ctx.Err())
	}
}

func (b *Bridge) addClient(conn *websocket.Conn) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[conn] = struct{}{}
}

func (b *Bridge) removeClient(conn *websocket.Conn) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, conn)
}

func (b *Bridge) resolvePending(message protocol.Message) bool {
	b.mu.Lock()
	responseCh, ok := b.pending[message.ID]
	b.mu.Unlock()
	if !ok {
		return false
	}

	select {
	case responseCh <- message:
	default:
	}
	return true
}

func (b *Bridge) forgetPending(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.pending, id)
}

func (b *Bridge) writeJSON(conn *websocket.Conn, message protocol.Message) error {
	responseBytes, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("build json message: %w", err)
	}

	b.writeMu.Lock()
	defer b.writeMu.Unlock()
	if err := conn.WriteMessage(websocket.TextMessage, responseBytes); err != nil {
		return fmt.Errorf("write websocket message: %w", err)
	}

	return nil
}

func (b *Bridge) writeJSONToAny(clients []*websocket.Conn, message protocol.Message) error {
	var lastErr error
	sent := 0
	for _, client := range clients {
		if err := b.writeJSON(client, message); err != nil {
			lastErr = err
			continue
		}
		sent++
	}
	if sent == 0 && lastErr != nil {
		return fmt.Errorf("send websocket request: %w", lastErr)
	}

	return nil
}
