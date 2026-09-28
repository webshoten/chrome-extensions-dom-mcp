#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
DENO_BIN="${DENO_BIN:-deno}"
SWIFT_CACHE_DIR="${TMPDIR:-/tmp}/bridge-swift-module-cache"

if ! "${DENO_BIN}" eval '
  const [major, minor, patch] = Deno.version.deno.split(".").map(Number);
  const supported = major > 2 ||
    (major === 2 && (minor > 9 || (minor === 9 && patch >= 7)));
  Deno.exit(supported ? 0 : 1);
'; then
  echo "Deno 2.9.7 or newer is required to build a signed macOS app" >&2
  exit 1
fi

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
  --icon src/desktop/assets/app-icon.png \
  --output "${DIST_DIR}/Bridge" \
  src/desktop/main.ts

codesign --force --sign - "${DIST_DIR}/Bridge.app"
codesign --verify --deep --strict "${DIST_DIR}/Bridge.app"

echo "Built ${DIST_DIR}/Bridge.app"
