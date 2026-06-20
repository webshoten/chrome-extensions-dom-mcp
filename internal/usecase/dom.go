package usecase

import (
	"context"
	"fmt"
	"time"

	"chrome-extensions-dom-mcp/internal/protocol"
)

// BrowserRequester は接続済みのChrome拡張へプロトコルメッセージを送ります。
type BrowserRequester interface {
	Request(ctx context.Context, message protocol.Message) (protocol.Message, error)
}

// DOMService はMCPやWebSocketの詳細から独立したDOM取得処理を担当します。
type DOMService struct {
	browser BrowserRequester
}

// NewDOMService はアクティブタブDOM取得のユースケース入口を作ります。
func NewDOMService(browser BrowserRequester) *DOMService {
	return &DOMService{browser: browser}
}

// GetDOM は接続済みのChrome拡張へ現在のアクティブタブのスナップショット取得を依頼します。
func (s *DOMService) GetDOM(ctx context.Context) ([]byte, error) {
	response, err := s.browser.Request(ctx, protocol.Message{
		ID:   fmt.Sprintf("get-dom-%d", time.Now().UnixNano()),
		Type: "get_dom",
	})
	if err != nil {
		return nil, err
	}
	if response.Error != nil {
		return nil, fmt.Errorf("%s: %s", response.Error.Code, response.Error.Message)
	}

	return response.Payload, nil
}
