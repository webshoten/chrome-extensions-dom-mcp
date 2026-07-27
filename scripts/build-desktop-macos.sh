#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
DENO_BIN="${DENO_BIN:-deno}"
SWIFT_CACHE_DIR="${TMPDIR:-/tmp}/bridge-swift-module-cache"

mkdir -p "${DIST_DIR}"
cd "${ROOT_DIR}"

CLANG_MODULE_CACHE_PATH="${SWIFT_CACHE_DIR}" swift \
  scripts/render-desktop-icon.swift \
  src/desktop/assets/tray-icon.svg \
  src/desktop/assets/tray-icon.png
CLANG_MODULE_CACHE_PATH="${SWIFT_CACHE_DIR}" swift \
  scripts/render-desktop-icon.swift \
  src/desktop/assets/tray-icon-dark.svg \
  src/desktop/assets/tray-icon-dark.png

rm -rf "${DIST_DIR}/Bridge.app"

"${DENO_BIN}" desktop \
  --allow-net=127.0.0.1:9333 \
  --allow-env=HOME,PATH,DENO_SERVE_ADDRESS \
  --allow-read \
  --allow-write \
  --allow-run \
  --include=src/desktop/assets/tray-icon.png \
  --include=src/desktop/assets/tray-icon-dark.png \
  --output "${DIST_DIR}/Bridge.app" \
  src/desktop/main.ts

echo "Built ${DIST_DIR}/Bridge.app"
