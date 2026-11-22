#!/bin/sh
# 构建并部署官网到 Cloudflare Workers（静态资源）。部署目录是临时拼出来的，只含页面要的文件。
set -e
cd "$(dirname "$0")"
rm -rf dist _deploy && node build.mjs >/dev/null
mkdir -p _deploy && cp -R index.html style.css fonts dist _deploy/
npx wrangler deploy -c "$PWD/wrangler.jsonc" "$@"
