#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

mkdir -p "${DIST_DIR}"

cd "${ROOT_DIR}"

rm -f "${DIST_DIR}/bridge-darwin-amd64" \
  "${DIST_DIR}/bridge-darwin-arm64" \
  "${DIST_DIR}/install-macos.sh"
rm -rf "${DIST_DIR}/Bridge.app" \
  "${DIST_DIR}"/Bridge-*.app \
  "${DIST_DIR}"/Bridge-*.app.zip

echo "Building macOS binaries..."
deno compile \
  --allow-net=127.0.0.1:9333 \
  --target x86_64-apple-darwin \
  --output "${DIST_DIR}/bridge-darwin-amd64" \
  src/bridge/main.ts
deno compile \
  --allow-net=127.0.0.1:9333 \
  --target aarch64-apple-darwin \
  --output "${DIST_DIR}/bridge-darwin-arm64" \
  src/bridge/main.ts

cp "${ROOT_DIR}/scripts/install-macos.sh" "${DIST_DIR}/install-macos.sh"
chmod +x "${DIST_DIR}/install-macos.sh"

echo "Release assets written to ${DIST_DIR}:"
ls -lh "${DIST_DIR}"
