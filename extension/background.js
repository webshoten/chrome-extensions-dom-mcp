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
