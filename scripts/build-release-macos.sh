#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

mkdir -p "${DIST_DIR}"

cd "${ROOT_DIR}"

echo "Building macOS binaries..."
GOOS=darwin GOARCH=amd64 go build -o "${DIST_DIR}/dom-bridge-darwin-amd64" ./cmd/dom-bridge
GOOS=darwin GOARCH=arm64 go build -o "${DIST_DIR}/dom-bridge-darwin-arm64" ./cmd/dom-bridge

cp "${ROOT_DIR}/scripts/install-macos.sh" "${DIST_DIR}/install-macos.sh"
chmod +x "${DIST_DIR}/install-macos.sh"

echo "Release assets written to ${DIST_DIR}:"
ls -lh "${DIST_DIR}"
