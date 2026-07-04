#!/usr/bin/env bash
set -euo pipefail

REPO="webshoten/chrome-extensions-dom-mcp"
APP_NAME="bridge"
PLIST_ID="com.webshoten.bridge"
LEGACY_PLIST_ID="com.webshoten.dom-bridge"
INSTALL_DIR="${HOME}/.local/bin"
BIN_PATH="${INSTALL_DIR}/${APP_NAME}"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_ID}.plist"
LEGACY_PLIST_PATH="${HOME}/Library/LaunchAgents/${LEGACY_PLIST_ID}.plist"

arch="$(uname -m)"
case "${arch}" in
  arm64)
    binary_asset="bridge-darwin-arm64"
    ;;
  x86_64)
    binary_asset="bridge-darwin-amd64"
    ;;
  *)
    echo "Unsupported macOS architecture: ${arch}" >&2
    exit 1
    ;;
esac

tmp_dir="$(mktemp -d)"
tmp_binary="${tmp_dir}/bridge"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

if [[ -n "${BRIDGE_BINARY:-}" ]]; then
  if [[ ! -f "${BRIDGE_BINARY}" ]]; then
    echo "BRIDGE_BINARY does not exist: ${BRIDGE_BINARY}" >&2
    exit 1
  fi
  echo "Using local binary: ${BRIDGE_BINARY}"
  cp "${BRIDGE_BINARY}" "${tmp_binary}"
else
  download_url="https://github.com/${REPO}/releases/latest/download/${binary_asset}"
  echo "Downloading ${binary_asset}..."
  curl -fL "${download_url}" -o "${tmp_binary}"
fi

launchctl kill TERM "gui/$(id -u)/${PLIST_ID}" >/dev/null 2>&1 || true
launchctl bootout "gui/$(id -u)" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl kill TERM "gui/$(id -u)/${LEGACY_PLIST_ID}" >/dev/null 2>&1 || true
launchctl bootout "gui/$(id -u)" "${LEGACY_PLIST_PATH}" >/dev/null 2>&1 || true
rm -f "${LEGACY_PLIST_PATH}" "${INSTALL_DIR}/dom-bridge"

mkdir -p "${INSTALL_DIR}" "$(dirname "${PLIST_PATH}")"
install -m 0755 "${tmp_binary}" "${BIN_PATH}"

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN_PATH}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/bridge.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/bridge.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${PLIST_ID}"

port_owner_pid="$(lsof -nP -tiTCP:9333 -sTCP:LISTEN 2>/dev/null || true)"
port_owner_pid="${port_owner_pid%%$'\n'*}"
if [[ -n "${port_owner_pid}" ]]; then
  port_owner_command="$(ps -p "${port_owner_pid}" -o comm= 2>/dev/null || true)"
  echo
  echo "Bridge daemon is listening on port 9333. PID ${port_owner_pid}: ${port_owner_command}" >&2
fi

echo "Installed bridge to ${BIN_PATH}"
echo "Installed LaunchAgent to ${PLIST_PATH}"
echo "Started daemon with launchd: ${PLIST_ID}"
echo
echo "Check status:"
echo "  curl http://127.0.0.1:9333/status"
echo
echo "Start or restart daemon:"
echo "  launchctl kickstart -k gui/\$(id -u)/${PLIST_ID}"
echo
echo "Stop daemon:"
echo "  launchctl kill TERM gui/\$(id -u)/${PLIST_ID}"
echo
echo "MCP command path:"
echo "  ${BIN_PATH}"
