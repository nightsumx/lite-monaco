# lite-monaco 官网

单页静态站。页面上每个编辑器都是直接从 `../src` 打包进来的 lite-monaco，不是截图。

- 构建：`node site/build.mjs`（产物在 `site/dist/`，不进仓库）
- 预览：`python3 -m http.server -d site 5311`
- 部署：`sh site/deploy.sh`（Cloudflare Workers 静态资源，`site/wrangler.jsonc`）
- 体积数字：`node site/measure.mjs` 重新量，改了要同步 `index.html` 和 `README.md`

单测点阵的数据在构建时从 `PARITY.md` 逐文件读出（`build.mjs` 的 `virtual:parity`）；总数和页面上写的 3863 / 3279 / 584 对不上时构建直接失败。浏览器差分的数字（353/201、338/232、338/227）抄自 `scripts/browser-diff/PROGRESS.md`，是手写的。
