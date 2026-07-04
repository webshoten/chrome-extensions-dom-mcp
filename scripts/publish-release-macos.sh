#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/publish-release-macos.sh <tag>" >&2
  echo "Example: scripts/publish-release-macos.sh v0.1.1" >&2
  exit 1
fi

tag="$1"

cd "${ROOT_DIR}"

scripts/build-release-macos.sh

if gh release view "${tag}" >/dev/null 2>&1; then
  echo "Release ${tag} already exists. Uploading assets..."
  gh release upload "${tag}" \
    dist/bridge-darwin-amd64 \
    dist/bridge-darwin-arm64 \
    dist/install-macos.sh \
    --clobber
else
  echo "Creating release ${tag}..."
  gh release create "${tag}" \
    dist/bridge-darwin-amd64 \
    dist/bridge-darwin-arm64 \
    dist/install-macos.sh \
    --title "${tag}" \
    --notes "macOS bridge release ${tag}"
fi

echo "Published ${tag}."
echo
echo "Install command:"
echo "  curl -fsSL https://github.com/webshoten/chrome-extensions-dom-mcp/releases/latest/download/install-macos.sh | bash"
