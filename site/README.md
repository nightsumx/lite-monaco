# lite-monaco 官网

静态站：英文首页 `index.html`（`/`）、中文首页 `zh/index.html`（`/zh/`），两页结构和 id 一致，`main.ts` 按 `<html lang>` 取文字；文档页是英文的，源文件在 `docs-src/*.md`，`pages.mjs` 生成。页面上每个编辑器都是直接从 `../src` 打包进来的 lite-monaco，不是截图。

- 构建：`node site/build.mjs`（JS 在 `site/dist/`，整站拼在 `site/_deploy/`：首页、`docs-src/*.md` 生成的文档页、sitemap、llms.txt，都不进仓库）
- 预览：`python3 -m http.server -d site/_deploy 5311`
- 部署：`sh site/deploy.sh`（Cloudflare Workers 静态资源，`site/wrangler.jsonc`；只部署 HEAD，在临时目录里构建）
- 体积数字：`node site/measure.mjs` 重新量，改了要同步 `index.html`、`zh/index.html`、`docs-src/bundle-size.md`、`pages.mjs` 里的 llms.txt 和仓库的 `README.md`

单测点阵的数据在构建时从 `PARITY.md` 逐文件读出（`build.mjs` 的 `virtual:parity`）；总数和页面上写的 3863 / 3279 / 584 对不上时构建直接失败。浏览器差分的数字（353/201、338/232、338/227）抄自 `scripts/browser-diff/PROGRESS.md`，是手写的。

分享图 `og.png`（1200×630）由 `node site/og.mjs` 用 Playwright 的 Chromium 截出来，进仓库；首页的标语或数字变了就重截。
