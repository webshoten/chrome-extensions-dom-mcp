const WS_URL = "ws://127.0.0.1:9333/ws";
const PING_INTERVAL_MS = 20_000;
const RECONNECT_DELAY_MS = 3_000;

let socket = null;
let pingTimer = null;
let reconnectTimer = null;
let nextMessageId = 1;

function log(message, detail) {
  if (detail === undefined) {
    console.log(`[dom-bridge] ${message}`);
    return;
  }

  console.log(`[dom-bridge] ${message}`, detail);
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

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const message = {
    id: `ping-${nextMessageId}`,
    type: "ping"
  };
  nextMessageId += 1;

  socket.send(JSON.stringify(message));
  log("sent ping", message);
}

function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log("cannot send message because websocket is not open", message);
    return;
  }

  socket.send(JSON.stringify(message));
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (tabs.length === 0 || tabs[0].id === undefined) {
    throw new Error("active tab was not found");
  }

  return tabs[0];
}

async function captureDOM() {
  const tab = await getActiveTab();
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      html: document.documentElement.outerHTML
    })
  });

  if (results.length === 0 || results[0].result === undefined) {
    throw new Error("dom capture returned no result");
  }

  return results[0].result;
}

async function handleRequest(message) {
  if (message.type !== "get_dom") {
    return;
  }

  try {
    const payload = await captureDOM();
    sendMessage({
      id: message.id,
      type: "get_dom_result",
      payload
    });
  } catch (error) {
    sendMessage({
      id: message.id,
      type: "error",
      error: {
        code: "DOM_CAPTURE_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

function startPingLoop() {
  clearPingTimer();
  sendPing();
  pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
}

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
    } catch (error) {
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

chrome.alarms.create("dom-bridge-keepalive", {
  periodInMinutes: 1
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "dom-bridge-keepalive") {
    return;
  }

  connect();
});

connect();
