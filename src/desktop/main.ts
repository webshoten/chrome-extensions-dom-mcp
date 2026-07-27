import { serveFixedHttp } from "../bridge/daemon/fixed_http_server.ts";
import { DOMServer } from "../bridge/daemon/http_api.ts";
import { WebSocketBridge } from "../bridge/daemon/ws_bridge.ts";
import { AgentSetupService } from "./agent_setup.ts";
import { LoginItemService } from "./login_item.ts";
import { DesktopUI } from "./ui.ts";

const BRIDGE_ADDR = "127.0.0.1:9333";
const MCP_ENDPOINT = `http://${BRIDGE_ADDR}/mcp`;

/*
 * # Bridge Desktop app
 *
 * ## 目的
 * macOS上でBridgeの実行状態を可視化しながら、MCP HTTPとChrome拡張接続を1つのappとして常駐させる。
 *
 * ## 説明
 * Desktop UIはDeno Desktopの自動port、外部I/Fは既知の固定portを使い、終了時は両方を同時に止める。
 */
async function main(): Promise<void> {
  const bridge = new WebSocketBridge();
  const bridgeServer = new DOMServer(BRIDGE_ADDR, bridge);
  const fixedServer = serveFixedHttp(
    BRIDGE_ADDR,
    (request) => bridgeServer.handleRequest(request),
  );
  void fixedServer.finished.catch((error) => {
    console.error("bridge fixed HTTP server stopped", error);
  });

  const ui = new DesktopUI(
    bridgeServer,
    new AgentSetupService(MCP_ENDPOINT),
    new LoginItemService(),
  );
  Deno.serve((request) => ui.handleRequest(request));

  const window = new Deno.BrowserWindow({
    title: "Bridge",
    width: 520,
    height: 560,
    resizable: true,
  });
  window.setApplicationMenu([
    {
      submenu: {
        label: "Bridge",
        items: [{ role: { role: "quit" } }],
      },
    },
    {
      submenu: {
        label: "Edit",
        items: [
          { role: { role: "copy" } },
          { role: { role: "paste" } },
          { role: { role: "selectAll" } },
        ],
      },
    },
  ]);

  const showApp = () => {
    Deno.dock.setVisible(true);
    window.show();
    window.focus();
  };
  const hideApp = () => {
    window.hide();
    Deno.dock.setVisible(false);
  };

  // windowを閉じてもChrome接続を維持し、メニューバーから再表示できる状態にします。
  window.addEventListener("close", (event) => {
    event.preventDefault();
    hideApp();
  });
  if (Deno.args.includes("--background")) {
    hideApp();
  } else {
    Deno.dock.setVisible(true);
  }

  const tray = new Deno.Tray();
  tray.setIcon(
    await Deno.readFile(new URL("./assets/tray-icon.png", import.meta.url)),
  );
  tray.setIconDark(
    await Deno.readFile(
      new URL("./assets/tray-icon-dark.png", import.meta.url),
    ),
  );
  tray.setTooltip("Bridge");
  tray.setMenu([
    { item: { label: "Bridgeを開く", id: "open", enabled: true } },
    "separator",
    { item: { label: "Bridgeを終了", id: "quit", enabled: true } },
  ]);
  tray.addEventListener("click", () => {
    showApp();
  });
  tray.addEventListener("menuclick", (event) => {
    if (event.detail.id === "open") {
      showApp();
    }
    if (event.detail.id === "quit") {
      fixedServer.close();
      Deno.exit(0);
    }
  });
  Deno.dock.addEventListener("reopen", () => showApp());
}

if (import.meta.main) {
  await main();
}
