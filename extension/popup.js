const STATUS_URL = "http://127.0.0.1:9333/status";

const summary = document.getElementById("summary");
const statusDot = document.getElementById("statusDot");
const daemonStatus = document.getElementById("daemonStatus");
const extensionStatus = document.getElementById("extensionStatus");
const tabStatus = document.getElementById("tabStatus");

function setStatus(kind, text, daemonText, extensionText, tabText) {
  statusDot.className = `status-dot ${kind}`;
  summary.textContent = text;
  daemonStatus.textContent = daemonText;
  extensionStatus.textContent = extensionText;
  tabStatus.textContent = tabText;
}

async function getActiveTabStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id === undefined) {
    return "未検出";
  }
  if (!tab.url || tab.url.startsWith("chrome://")) {
    return "対象外";
  }
  return "取得可能";
}

async function refreshStatus() {
  setStatus("status-checking", "状態を確認しています", "確認中", "確認中", "確認中");
  const activeTabText = await getActiveTabStatus();

  try {
    const response = await fetch(STATUS_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const status = await response.json();
    const connections = Number(status.extensionConnections ?? 0);
    if (connections > 0) {
      setStatus("status-ready", "接続済み", "起動中", "接続済み", activeTabText);
      return;
    }

    setStatus("status-warning", "Bridgeは起動中です", "起動中", "未接続", activeTabText);
  } catch (_error) {
    setStatus("status-error", "Bridge未起動", "未起動", "未接続", activeTabText);
  }
}

refreshStatus();
