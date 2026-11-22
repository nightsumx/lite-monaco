#!/bin/sh
# 把 lite-monaco 导出到公开仓库 github.com/nightsumx/lite-monaco 的本地检出。
# 开发仍在这个 monorepo 里做；公开仓库只收这里已提交的文件，减去下面的内部草稿。
#
#   sh scripts/export-public.sh ~/Documents/lite-monaco
#   cd ~/Documents/lite-monaco && npm ci && npm run build && npm test && git add -A && git commit -m "…" && git push
#
# 只导出已提交的内容（git archive HEAD），工作区里别的线程没提交的改动不会带出去。
set -e
dest=${1:?用法: sh scripts/export-public.sh <公开仓库目录>}
here=$(cd "$(dirname "$0")/.." && pwd)
[ -d "$dest/.git" ] || { echo "$dest 不是 git 仓库"; exit 1; }

# 内部草稿和工作记录：设计笔记、交接、扫描报告、路线图、PoC、给 agent 的说明
internal='AGENTS.md API-STABLE.md CAPABILITIES.md CM6-LEFTOVER.md CM7-DESIGN.md DESIGN.md DEVICE-TEST.md ENDPOINT.md HANDOVER.md MILESTONES.md PERF-OPS.md PERF.md ROADMAP.md SCAN-2026-07-18.md SCAN-ACCEPT-2026-07-18.md SCAN-ACCEPT-2026-07-19.md TODO-CM6-LEFTOVER.md aihand.config.ts bun.lock poc docs examples demo/AGENTS.md'

# 清空目标（保留 .git、node_modules、package-lock.json），再放进 HEAD 的文件
find "$dest" -mindepth 1 -maxdepth 1 ! -name .git ! -name node_modules ! -name package-lock.json -exec rm -rf {} +
cd "$here"
git archive --format=tar HEAD . | tar -x -C "$dest"
for p in $internal; do rm -rf "$dest/$p"; done
echo "exported to $dest: $(cd "$dest" && git status --short | wc -l | tr -d " ") changes"
