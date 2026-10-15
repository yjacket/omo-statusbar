#!/usr/bin/env sh
# From a clone: sh install.sh (local copy)
# Without a clone: curl -fsSL https://raw.githubusercontent.com/yjacket/omo-status-arrange/master/install.sh | sh
set -e
dl=""
src="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/extension/status-arrange"
agent="${OMO_CODING_AGENT_DIR:-${SENPI_CODING_AGENT_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.omo/agent}}}"
ext="$agent/extensions"
dst="$ext/status-arrange"
tmp="$ext/status-arrange.tmp-$$"
trap 'rm -rf "$tmp" ${dl:+"$dl"}' EXIT
if [ ! -d "$src" ]; then
	dl="$(mktemp -d)"
	curl -fsSL https://github.com/yjacket/omo-status-arrange/archive/refs/heads/master.tar.gz | tar -xz -C "$dl"
	src="$dl/omo-status-arrange-master/extension/status-arrange"
fi
[ -d "$src" ] || { echo "missing $src" >&2; exit 1; }
mkdir -p "$ext"
rm -rf "$tmp"
cp -R "$src" "$tmp"
rm -rf "$dst"
mv "$tmp" "$dst"
echo "installed -> $dst"
echo "Type /reload in running omo sessions."
