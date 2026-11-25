# 浏览器差分测试(真 Monaco 0.55.1 vs lite-monaco)

```
cd scripts/browser-diff
npm i                 # 只装 playwright-core;真 Monaco 用 lite-monaco 的 devDependency
node build.mjs        # src/ 改过就要重建(esbuild 到 out/)
node run.mjs [子串]    # 跑场景(如 20-long);不带过滤才写 REPORT.md,结果在 out/result*.json
node smoke.mjs [名]    # monaco-editor test/smoke 的思路:plaintext/css/html/json/typescript
```
headless Chrome(`channel:'chrome'`),不抢焦点;场景在 `scenarios/`,已知差异分类在 `known.mjs`。

## 调试小工具与输入法步骤(第四轮·块B)
- `showdiff.mjs <结果后缀> [场景子串] [条数]`:打印 `out/result-*.json` 里的差异;`probe.mjs` / `shot.mjs` / `gl.mjs`:单行探测 DOM、截图、逐字形位置。
- 场景 step:`imeSet {text,start?,end?}` / `imeCommit {text}` / `imeCancel` / `blur`(CDP `Input.imeSetComposition` / `insertText`,**只是模拟,不是真输入法**,只在 Chromium 下可用)。快照 spec 新增 `glyphs: [行号…]`(DOM Range 的真字形位置)。
- `scenarios/85-rtl`(RTL)、`86-grapheme`(字素簇)、`87-ime`(输入法)。

## 引擎 / 像素比 / 触摸 / 剪贴板(第四轮·块D)
- `ENGINE=firefox|webkit node run.mjs [子串]`:同一套场景换引擎(Playwright 的 Firefox 151 / WebKit 26.5,不是真 Safari)。装法:`node node_modules/playwright-core/cli.js install firefox webkit`(国内走代理从 cdn.playwright.dev 下)。无 CDP 的引擎跑不了 `ime*` 步骤和 `95-a11y`(自动跳过)。结果写 `out/result*@firefox.json` / `REPORT@firefox.md`,不覆盖 Chromium 的 `REPORT.md`。
- `DPR=2|1.5 node run.mjs`:Chromium 高像素比(deviceScaleFactor)。`TOUCH=mobile|touch`:`hasTouch`/`isMobile`。`NOPERM=1`:Chromium 不授 clipboard 权限(= 普通网页的真实环境)。结果文件带 `@dpr2` 等后缀。
- `node clipboard.mjs [过滤]`:真 ⌘C/⌘X/⌘V 走系统剪贴板的差分(读回 text/plain、text/html;预置剪贴板的 case 只在 Chromium + 权限下跑,`ENGINE=…`/`NOPERM=1` 只跑「复制→粘贴」往返)。
- `node touch.mjs [过滤]`:触摸/移动模拟(点按、双击/三击、滑动滚动、软键盘属性),只在 Chromium;**headless 没有真软键盘和系统选区手柄,只验证事件与属性层面**。
- `scenarios/97-engines`:补全弹层 / 撤销栈 / beforeinput 提交 / 组合字符 / Tab 焦点 / RTL 选区框,专门拿来换引擎对照。

## 装出来的包(用户的整条链路)

```
node pack.mjs              # = 仓库根目录的 npm run test:consumer;发版前跑(npm run release:check 含它)
```
源码页测的是 `src/`,用户拿到的是 `dist/` 经过 `npm pack`、在别人项目里 `npm install`、再被他的打包器生产构建之后的东西;0.4.0、0.4.1 的默认键位就坏在这中间,源码测试全绿。`pack.mjs` 把这段链路原样走一遍:

1. `npm run build`(含 `scripts/build/check-dist.mjs`),`npm pack`,tarball 装进 monorepo 外的干净目录 `~/.cache/lite-monaco-consumer`(在 monorepo 里会借到它的 node_modules,缺依赖测不出来);核对装上的就是这次构建的。
2. 同一份 harness 和入口,`import 'lite-monaco'`、`'lite-monaco/react'` 走装好的包,分别用 **Vite 8(Rolldown)** 和 **esbuild(压缩、分块)** 生产构建,得到 `out/pack-vite/`、`out/pack-esbuild/`。peer 的版本和源码页用的一致。
3. `run.mjs`、`smoke.mjs`、`clipboard.mjs`、`react/run.mjs` 带 `PACK=vite,esbuild` 跑:每个场景源码页和两种包同时跑,**包的结果必须和源码逐项相同**(没有可接受的差别),另外照旧和真 Monaco 比。任何一处不同,退出码非 0。
4. 黑盒:官方模板 `templates/vite` 原样(它的 `tsc` 读 dist 的 `.d.ts`,再 `vite build`),和 README 的最少安装(`lite-monaco shiki`,可选 peer 一个不装),真 Chrome 里点行首、方向键、Home/End、打字、撤销,模板还要等到 TS 诊断标出来,不许有页面错误。

`LM_TGZ=<tarball> node pack.mjs` 测一个现成的包(比如 `npm pack lite-monaco@0.4.1` 拿到的),看这套测试能不能把它的问题测出来;`--pages-only` 只打页面,之后 `PACK=vite node run.mjs 50-keys` 单跑;`--bundlers=vite`、`--skip=react,clipboard,templates` 缩小范围。
