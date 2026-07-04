# Bridge Source

`main.ts` is the compiled entrypoint for the `bridge` binary.

- `main.ts`: CLI mode switch. Runs `mcp` by default or `daemon` when the first
  argument is `daemon`.
- `daemon/`: localhost HTTP API and WebSocket bridge for the Chrome extension.
- `mcp/`: stdio MCP server and tool request/response handling.
- `protocol/`: shared message and payload types.
