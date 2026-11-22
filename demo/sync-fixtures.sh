#!/bin/sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/demo/public/fixtures"
cp -f "$ROOT/dist/index.js" "$ROOT/demo/public/fixtures/index.js.txt"
# typescript chunk 文件名带 hash，取最新
TS=$(ls -t "$ROOT/dist"/typescript-*.js 2>/dev/null | head -1)
if [ -n "$TS" ]; then cp -f "$TS" "$ROOT/demo/public/fixtures/typescript.js.txt"; fi
ls -lah "$ROOT/demo/public/fixtures"
