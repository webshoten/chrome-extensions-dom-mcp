#!/usr/bin/env bash
set -euo pipefail

REPO="webshoten/chrome-extensions-dom-mcp"
APP_NAME="dom-bridge"
PLIST_ID="com.webshoten.dom-bridge"
INSTALL_DIR="${HOME}/.local/bin"
BIN_PATH="${INSTALL_DIR}/${APP_NAME}"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_ID}.plist"

arch="$(uname -m)"
case "${arch}" in
  arm64)
    asset="dom-bridge-darwin-arm64"
    ;;
  x86_64)
    asset="dom-bridge-darwin-amd64"
    ;;
  *)
    echo "Unsupported macOS architecture: ${arch}" >&2
    exit 1
    ;;
esac

download_url="https://github.com/${REPO}/releases/latest/download/${asset}"
tmp_file="$(mktemp)"
cleanup() {
  rm -f "${tmp_file}"
}
trap cleanup EXIT

echo "Downloading ${asset}..."
curl -fL "${download_url}" -o "${tmp_file}"

mkdir -p "${INSTALL_DIR}"
install -m 0755 "${tmp_file}" "${BIN_PATH}"

mkdir -p "${HOME}/Library/LaunchAgents"
cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/${PLIST_ID}.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/${PLIST_ID}.error.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl kickstart -k "gui/$(id -u)/${PLIST_ID}"

echo "Installed ${APP_NAME} to ${BIN_PATH}"
echo "Started daemon with launchd: ${PLIST_ID}"
echo
echo "Check status:"
echo "  curl http://127.0.0.1:9333/status"
echo
echo "Start daemon:"
echo "  launchctl kickstart -k gui/\$(id -u)/${PLIST_ID}"
echo
echo "Stop daemon:"
echo "  launchctl kill TERM gui/\$(id -u)/${PLIST_ID}"
echo
echo "MCP command path:"
echo "  ${BIN_PATH}"
