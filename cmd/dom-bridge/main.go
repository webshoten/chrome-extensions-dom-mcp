package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"chrome-extensions-dom-mcp/internal/httpapi"
	"chrome-extensions-dom-mcp/internal/mcp"
	"chrome-extensions-dom-mcp/internal/usecase"
	"chrome-extensions-dom-mcp/internal/ws"
)

const daemonAddr = "127.0.0.1:9333"

func main() {
	log.SetOutput(os.Stderr)

	command := "mcp"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	switch command {
	case "mcp":
		runMCP()
	case "daemon":
		runDaemon()
	case "help", "-h", "--help":
		printHelp()
	default:
		log.Fatalf("unknown command: %s", command)
	}
}

func runMCP() {
	domGetter := httpapi.NewProxyDOMGetter("http://" + daemonAddr)
	if err := mcp.Run(context.Background(), os.Stdin, os.Stdout, domGetter); err != nil {
		log.Fatal(err)
	}
}

func runDaemon() {
	bridge := ws.NewBridge()
	localDOMService := usecase.NewDOMService(bridge)

	httpServer := httpapi.NewDOMServer(daemonAddr, localDOMService, bridge.HandleWebSocket, bridge)
	if err := httpServer.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func printHelp() {
	fmt.Fprintf(os.Stderr, `dom-bridge

Usage:
  dom-bridge mcp      Run stdio MCP server. This is the default.
  dom-bridge daemon   Run localhost daemon for Chrome extension connection.
  dom-bridge help     Show this help.

`)
}
