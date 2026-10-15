#!/usr/bin/env sh
# Run from a clone: sh install.sh (local copy only, no download)
set -e
src="$(cd "$(dirname "$0")" && pwd)/extension/status-arrange"
agent="${OMO_CODING_AGENT_DIR:-${SENPI_CODING_AGENT_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.omo/agent}}}"
[ -d "$src" ] || { echo "missing $src" >&2; exit 1; }
ext="$agent/extensions"
dst="$ext/status-arrange"
tmp="$ext/status-arrange.tmp-$$"
mkdir -p "$ext"
rm -rf "$tmp"
trap 'rm -rf "$tmp"' EXIT
cp -R "$src" "$tmp"
rm -rf "$dst"
mv "$tmp" "$dst"
echo "installed -> $dst"
echo "Type /reload in running omo sessions."
