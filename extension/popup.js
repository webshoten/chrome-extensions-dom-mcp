const STATUS_URL = "http://127.0.0.1:9333/status";
const DOWNLOAD_URL = "https://github.com/webshoten/chrome-extensions-dom-mcp/releases";
const INSTALL_COMMAND =
  "curl -fsSL https://github.com/webshoten/chrome-extensions-dom-mcp/releases/latest/download/install-macos.sh | bash";
const START_COMMAND = "launchctl kickstart -k gui/$(id -u)/com.webshoten.dom-bridge";
const STOP_COMMAND = "launchctl kill TERM gui/$(id -u)/com.webshoten.dom-bridge";

const summary = document.getElementById("summary");
const statusDot = document.getElementById("statusDot");
const daemonStatus = document.getElementById("daemonStatus");
const extensionStatus = document.getElementById("extensionStatus");
const refreshButton = document.getElementById("refreshButton");
const downloadButton = document.getElementById("downloadButton");
const setupPanel = document.getElementById("setupPanel");
const installCommand = document.getElementById("installCommand");
const startCommand = document.getElementById("startCommand");
const stopCommand = document.getElementById("stopCommand");
const copyInstallButton = document.getElementById("copyInstallButton");
const copyStartButton = document.getElementById("copyStartButton");
const copyStopButton = document.getElementById("copyStopButton");

installCommand.textContent = INSTALL_COMMAND;
startCommand.textContent = START_COMMAND;
stopCommand.textContent = STOP_COMMAND;

function setStatus(kind, text, daemonText, extensionText) {
  statusDot.className = `status-dot ${kind}`;
  summary.textContent = text;
  daemonStatus.textContent = daemonText;
  extensionStatus.textContent = extensionText;
}

async function refreshStatus() {
  setStatus("status-checking", "状態を確認しています", "確認中", "確認中");

  try {
    const response = await fetch(STATUS_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const status = await response.json();
    const connections = Number(status.extensionConnections ?? 0);
    if (connections > 0) {
      setStatus("status-ready", "接続済み", "起動中", "接続済み");
      downloadButton.classList.remove("primary");
      setupPanel.hidden = true;
      return;
    }

    setStatus("status-warning", "ローカルアプリは起動中です", "起動中", "未接続");
    downloadButton.classList.remove("primary");
    setupPanel.hidden = true;
  } catch (error) {
    setStatus("status-error", "ローカルアプリが必要です", "未起動", "未接続");
    downloadButton.classList.add("primary");
    setupPanel.hidden = false;
  }
}

refreshButton.addEventListener("click", refreshStatus);
downloadButton.addEventListener("click", () => {
  chrome.tabs.create({ url: DOWNLOAD_URL });
});

async function copyCommand(button, command, label) {
  await navigator.clipboard.writeText(command);
  button.textContent = "コピーしました";
  setTimeout(() => {
    button.textContent = label;
  }, 1500);
}

copyInstallButton.addEventListener("click", () =>
  copyCommand(copyInstallButton, INSTALL_COMMAND, "インストールコマンドをコピー")
);
copyStartButton.addEventListener("click", () =>
  copyCommand(copyStartButton, START_COMMAND, "起動コマンドをコピー")
);
copyStopButton.addEventListener("click", () =>
  copyCommand(copyStopButton, STOP_COMMAND, "停止コマンドをコピー")
);

refreshStatus();
