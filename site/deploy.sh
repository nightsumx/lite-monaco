#!/bin/sh
# 构建并部署官网到 Cloudflare Workers（静态资源）。
# 只部署已提交的代码：把 HEAD 解到临时目录里构建，工作区里别的线程没提交的改动不会上线。
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C "$root" archive HEAD . | tar -x -C "$tmp"
ln -s "$root/node_modules" "$tmp/node_modules"
node "$tmp/site/build.mjs" >/dev/null
npx wrangler deploy -c "$tmp/site/wrangler.jsonc" "$@"
