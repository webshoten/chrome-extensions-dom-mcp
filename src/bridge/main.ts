import { DOMServer } from "./daemon/http_api.ts";
import { WebSocketBridge } from "./daemon/ws_bridge.ts";
import { runMCP } from "./mcp/server.ts";

const DAEMON_ADDR = "127.0.0.1:9333";

if (import.meta.main) {
  const command = Deno.args[0] ?? "mcp";

  switch (command) {
    case "mcp":
      await runMCP(`http://${DAEMON_ADDR}`);
      break;
    case "daemon": {
      const bridge = new WebSocketBridge();
      const server = new DOMServer(DAEMON_ADDR, bridge);
      server.listenAndServe();
      await new Promise(() => {});
      break;
    }
    case "help":
    case "-h":
    case "--help":
      printHelp();
      break;
    default:
      console.error(`unknown command: ${command}`);
      Deno.exit(1);
  }
}

function printHelp(): void {
  console.error(`bridge

Usage:
  bridge mcp      Run stdio MCP server. This is the default.
  bridge daemon   Run localhost daemon for Chrome extension connection.
  bridge help     Show this help.
`);
}
