importScripts(
  "active_tab.js",
  "dom_tools.js",
  "network_tools.js",
  "console_tools.js",
  "action_tools.js",
  "screenshot_tools.js",
);

/*
 * # Chrome拡張service worker
 *
 * ## 目的
 * daemonから届くbrowser tool requestを、Chrome内で実行できる各tool実装へ振り分ける。
 *
 * ## 説明
 * 拡張側からdaemonへWebSocket接続を張る。daemonはこの接続を通じて現在タブへアクセスする。
 */
const WS_URL = "ws://127.0.0.1:9333/ws";
const PING_INTERVAL_MS = 20_000;
const RECONNECT_DELAY_MS = 3_000;

let socket = null;
let pingTimer = null;
let reconnectTimer = null;
let nextMessageId = 1;

const TOOL_HANDLERS = {
  list_tabs: () => globalThis.BridgeActiveTab.listTabs(),
  get_dom: (payload) => globalThis.BridgeDomTools.captureDOM(payload),
  get_network: (payload) => globalThis.BridgeNetworkTools.getNetwork(payload),
  get_console: (payload) => globalThis.BridgeConsoleTools.getConsole(payload),
  click: (payload) => globalThis.BridgeActionTools.click(payload),
  double_click: (payload) => globalThis.BridgeActionTools.doubleClick(payload),
  drag: (payload) => globalThis.BridgeActionTools.drag(payload),
  fill: (payload) => globalThis.BridgeActionTools.fill(payload),
  wait_for: (payload) => globalThis.BridgeActionTools.waitFor(payload),
  navigate: (payload) => globalThis.BridgeActionTools.navigate(payload),
  take_screenshot: (payload) =>
    globalThis.BridgeScreenshotTools.takeScreenshot(payload),
};

function log(message, detail) {
  if (detail === undefined) {
    console.log(`[bridge] ${message}`);
    return;
  }

  console.log(`[bridge] ${message}`, detail);
}

function clearPingTimer() {
  if (pingTimer !== null) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

// MV3 service workerの接続維持と、daemonから見た拡張生存確認のために送る軽量messageです。
function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const message = {
    id: `ping-${nextMessageId}`,
    type: "ping",
  };
  nextMessageId += 1;

  socket.send(JSON.stringify(message));
  log("sent ping", message);
}

// daemonへtool responseやerrorを返す出口です。接続が閉じている場合は再接続側に任せます。
function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log("cannot send message because websocket is not open", message);
    return;
  }

  socket.send(JSON.stringify(message));
}

// daemonから届いたtool requestを、tool名ごとの実装へ委譲します。
async function handleRequest(message) {
  const handler = TOOL_HANDLERS[message.type];
  if (!handler) {
    return;
  }

  try {
    const payload = await handler(message.payload ?? {});
    sendMessage({
      id: message.id,
      type: `${message.type}_result`,
      payload,
    });
  } catch (error) {
    sendMessage({
      id: message.id,
      type: "error",
      error: {
        code: `${message.type.toUpperCase()}_FAILED`,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function startPingLoop() {
  clearPingTimer();
  sendPing();
  pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
}

// daemonとのWebSocket接続を確立し、切断時は拡張側から再接続します。
function connect() {
  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  log(`connecting to ${WS_URL}`);
  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => {
    log("connected");
    startPingLoop();
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      log(`received ${message.type}`, message);
      handleRequest(message);
    } catch (_error) {
      log("received non-json message", event.data);
    }
  });

  socket.addEventListener("close", () => {
    log("disconnected; reconnecting soon");
    clearPingTimer();
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", (error) => {
    log("websocket error", error);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  log("installed");
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  log("startup");
  connect();
});

chrome.alarms.create("bridge-keepalive", {
  periodInMinutes: 1,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "bridge-keepalive") {
    return;
  }

  connect();
});

// Network履歴はイベント購読型なので、service worker起動時に一度だけ登録します。
globalThis.BridgeNetworkTools.register();
connect();
