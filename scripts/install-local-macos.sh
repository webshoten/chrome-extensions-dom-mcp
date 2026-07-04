#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Building local bridge binary..."
cd "${ROOT_DIR}"
deno compile --allow-net=127.0.0.1:9333 -o "${TMP_DIR}/bridge" src/bridge/main.ts

BRIDGE_BINARY="${TMP_DIR}/bridge" "${ROOT_DIR}/scripts/install-macos.sh"
