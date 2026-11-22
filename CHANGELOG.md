# Changelog

## 0.4.0 — 2026-11-23

0.3 是一个「Monaco 风格」的编辑器，有自己的一套 API；0.4 起是 monaco-editor 的平替。

- **Monaco 的 API**：`import * as monaco from 'lite-monaco'` 后 `monaco.editor.create`、`createModel`、`createDiffEditor`、`defineTheme`、`setModelMarkers`、`monaco.languages.register*Provider` 等同名同形，类型对照 Monaco 0.55.1 的 `monaco.d.ts` 机器校验。
- **拿 Monaco 自己的单元测试验收**：`src/vs/editor` 下 3863 条，适用的 3279 条全部通过（见 PARITY.md）。
- **Monarch**：`setMonarchTokensProvider`，以及 `lite-monaco/basic-languages` 里 monaco-editor 自带的 81 种语言定义。
- **JSON / CSS / HTML 语言服务**：`monaco.languages.json` / `css` / `html`，用同一套 `vscode-*-languageservice`（可选依赖），主线程懒加载。
- **Diff 编辑器**：行内模式、移动块、折叠未改区、Revert Block。
- **TypeScript 语言服务可放进 Worker**：`setTsWorker` + `lite-monaco/ts-worker`。
- **体积**：核心 gzip 580 KB，monaco-editor 同口径是 1201 KB（含 editor.worker）。
- **@monaco-editor/react**：`loader.config({ monaco })` 交给它 lite-monaco，`Editor` / `DiffEditor` / `useMonaco` 照常用。顺带修了 `setTheme` 遇到没定义过的名字（它默认传的 `'light'`）回落成暗色的问题，现在和 Monaco 一样回落 `vs`。
- **开源**：https://github.com/nightsumx/lite-monaco
- **破坏性变化**：`lite-monaco/monaco-shim` 删除（直接用 `lite-monaco`）；`litcode*` 系列名字改为 `liteMonaco*`；默认值全部改为 Monaco 的默认值（如 `automaticLayout: false`、`scrollBeyondLastLine: true`）。下面是逐项记录。

### 逐项记录
- **改名**:`litcode()` → `liteMonaco()`、`litcodeThemeCSS` → `liteMonacoThemeCSS`、`litcodeCM7` → `liteMonacoCM7`;类型 `LitCodeOptions` / `LitCodeFeatures` / `LitCodeEditor` → `LiteMonacoOptions` / `LiteMonacoFeatures` / `LiteMonacoEditor`;注入的样式 id `litcode-base` → `lite-monaco-base`。CSS 变量前缀 `--lc-*` → `--lm-*`。仓库目录 `litcode/` → `lite-monaco/`。以下旧条目里的 `litcode` 是当时的名字。

- TS 语言服务（typescript、标准库、program、类型检查）整体搬进 Web Worker：宿主 `setTsWorker(new Worker(...))`，worker 文件里 `import { startTsWorker } from 'lite-monaco/ts-worker'`；没配时同线程回环（行为一致，没有隔离）。会话 API 变了：`session.ts()` 去掉，`session.service()` 返回异步代理（方法同名、返回 Promise），`withDeadline` 变异步，括号跳过表由服务一侧算区间、主线程只存区间并随编辑映射。输入类功能（JSX 闭合标签、文档注释、输入时/粘贴时格式化）改为默认输入先落地、结果到了再补一个编辑（与 VS Code 的 TS 扩展一致）。
- 修复:主线程和 Worker 的文本对不上（补丁的旧长度不符）时，Worker 以前只打日志、之后一直用旧文本。现在 Worker 丢掉那份文件并发 `desync`，主线程整篇重发；夹在中间的请求收到 `TsDesync`，主线程重试一次。
- 新增 `litcode({ tsDiagnosticsRemote })`：诊断由宿主算（宿主另有整个工程的检查 Worker 时用），导出 `computeTsDiagnostics`。
- 加 `THIRD-PARTY-NOTICES.md` 并随包发布：内核里逐行移植自 CodeMirror 6 的代码（文档模型、rangeset、heightmap、输入处理等）和来自 Monaco / VS Code 的 fuzzy 打分、minimap 预烤字形表，按 MIT 的要求保留原版权声明；codicon 字体按 CC BY 4.0 署名。相关源文件头加了来源注释。
- 文档与 `package.json` 不再说“自研 / from-scratch”，改为“移植自 CodeMirror 6 的内核”；README 的体积数字更正（`dist/index.js` 约 1.5 MB，不是 700 KB）；README 顶部注明与微软无关。
- `package.json` 加 `repository` / `homepage` / `bugs`（指向 `nightsumx/text-suite` 的 `litcode` 目录；仓库推上去之后才可访问）。
- 删除 `lite-monaco/monaco-shim`。接入只用 `litcode()` / `DiffEditor`。
- `litcode({ state })`：恢复以前 `view.state`（撤销历史、选区、折叠保留），litcode 自身扩展按本次 lang/theme 重装。多 tab 宿主切走时存 state + destroy，切回时传回；换主题同理。
- `litcode({ keymap })`：宿主按键排在内置之前（如 Mod-s 保存）。
- `litcode({ fileName })`：TS 会话按文件区分；`.js` 按 JS 检查。
- `core.Transaction` 改为值导出：`Transaction.addToHistory.of(false)` / `Transaction.remote` 可用于外部改动不进撤销。
- token 缓存按 view 分开：多编辑器（多 tab、分屏）不再互相覆盖、串色。
- 主题 style 每次挂载挪到 `<head>` 末尾：明→暗→明切换后明主题生效。
- 修复：TS inlay hints 和同名高亮装饰没有装上。
- `view.setViewZone(id, { afterLine, height } | null)`：Monaco 的 view zone，在某行后面插一段空白，后面的行、行号和滚动高度跟着下推。Peek 面板和查找框顶部的留白用它。

### 默认值变化（对齐 Monaco 0.52）

- formatOnPaste、formatOnType、inlayHints 默认关。
- TS `moduleResolution` 不再是 Classic；同语言的多个实例共享一个 TS 项目。
- 默认行高按 Monaco 取整：`round(fontSize × 1.5)`，13px 字号对应 20px。
- 折叠键位：Mac 上 ⌘⌥[ / ⌘⌥] 折叠、展开（Win/Linux Ctrl+Shift+[ ]），⌘K ⌘L 切换，⌘K ⌘0 / ⌘K ⌘J 全折、全展，⌘K ⌘[ / ⌘K ⌘] 递归，⌘K ⌘1..7 按层级。Mac 上 ⌘⇧[ ⌘⇧] 不再被编辑器占用。
- 替换：Mac 上只绑 ⌥⌘F（⌘H 留给系统的隐藏应用），Win/Linux 用 Ctrl+H。
- 补全显式触发：⌃Space、⌥Esc、⌘I；⌘K ⌘I 显示 hover。
- 默认键位按 Monaco 在 Mac、Windows、Linux 上各自的绑定对齐（如 Linux 复制行 Ctrl+Shift+Alt+↑↓、Mac Go to Definition F12、Win/Linux 查找开关 Alt+C 等），⌘Space 不再触发补全（⌃Space 照旧）；面板、右键菜单、查找框按钮的键帽跟着实际绑定显示。新增 scrollLineUp/Down、scrollPageUp/Down。
- `navigator.platform` 为空（如 jsdom）时按 Linux 处理。
- Reindent Lines 只在宿主通过 `indentRulesFacet` 配了缩进规则时生效（Monaco standalone 的 TS 没有规则，这两条命令什么也不做）。
- `scrollBeyondLastLine` 默认开：最后一行能滚到顶，底部多出一屏减一行。`litcode({ scrollBeyondLastLine: false })` 关掉。minimap 滑块和滚动条按同样的总高算。
- Peek 面板不再盖住后面的行，改为把它们往下推（18 行高）。
- 打开查找框时顶部多出 33px（展开替换 62px）的留白，scrollTop 同步加上，可见的行不动；关掉时减回。概览标尺上的标记位置和 Monaco 一致。
- 竖滚动条滑块高度和位置按 Monaco 取整。

### 主题与样式

- 结构 CSS 全页只注入一份（`<style id="litcode-base">`），颜色走各实例 `.cm-editor` 上的 `--lm-*` 变量，浮层继承变量。同页多主题互不覆盖。
- `.cm-editor` 默认 `height:100%; min-height:0`。
- 选区背景改成满行高块：多行连成一片，空行和行尾多一个字宽，带圆角，失焦用 inactive 色。
- 折行时当前行边框只框光标所在的视觉行；光标顶对齐行盒。

### 修复

- 输入：组字保护（重画不换掉组字行）、幽灵字符重画、聚焦时写回选区、视口外选区上的输入和组字、长粘贴。跨行选区上开始组字不再多出一个拼音字母。组字后接着打字与组字同一个 undo 组。菜单里的撤销、重做（`historyUndo` / `historyRedo`）走编辑器历史。
- 焦点：编辑器没焦点时，外部改动改变行数不再抢焦点。
- 几何：posAtCoords 多减 padTop、小数行高、字素簇吸附、heightmap 重估、charWidth 探针、`display:none` 挂载、字体变化、折行下的点击和按视觉行导航。点折叠行按 x 取列，不落进隐藏行。点最后一行下方的空白时光标到文档末尾。新增 `moveToLineBoundary`、`moveVertically`、`lineBlockAt`。
- 折叠：Fold 折光标处最内层未折的块，已折就折外层；Fold Level N 只折恰好第 N 层，并跳过含选区的块；Fold Recursively 作用于包住光标的块。选区进了折叠体会自动展开那一块。`extraFoldField` 随文档映射。
- 命令与键位：和 Monaco 实测对照 436 条按键回放，差异从 130 处降为 0。Transform to Upper/Lower/Title Case 空光标时光标不动。Insert Cursor at End of Each Line 的末行落在选区终点。
- Compartment 按稳定 key 匹配，reconfigure 会重算 facet 和 field。
- 补全：移植 VS Code fuzzyScore；commitCharacters 只按候选声明；状态按 view 存；列表不截断，改为虚拟渲染；按上下文过滤。只剩一项时 ↑↓ 关列表并移动光标；补了 ⌘↑↓、⌃N/⌃P。组字提交的中文等非 ASCII 前缀不再弹出文档词。接受别的文件的导出时自动插入 import，和补全同一步撤销。
- TS：文件末尾的诊断做钳位；`lineStartsOf` 去掉二次方开销；签名提示在自动闭合 `()` 时也会弹，触发字符只认 `(` 和 `,`；hover 合成一张卡；新增重命名。点击或按键会取消等待中的 hover。
- 查找替换：⌘F 不改选区；窄模式；Esc 后马上 ⌘F 不再出现看不见的框；⌘G 不抢焦点；⌥⌘F 只从非空选区取查询，焦点按 Monaco 的规则放；计数在光标不在命中上时显示光标前最近一个命中的序号；正则空匹配。
- 浮层：quick input 挂在编辑器内，销毁时清理；Go to Line 解析；右键菜单支持键盘操作。命令面板补齐折叠、注释、行编辑等 Monaco 命令，标签和快捷键与 Monaco 一致，⌘K 和弦能正常显示。
- 括号匹配：光标不贴着括号时，高亮包住光标的最近一对。
- 视觉：tab-size、缩进参考线（guessIndentation）、`highlightLayer`、sticky scroll、多光标修饰键 facet、拖放、行号拖选。
- minimap：字形改用 Monaco 的预烤表，dpr2 下细笔画不再丢失；宽度按 Monaco 的布局公式计算，折行列随之对齐；折行时按视觉行画；点击滚动和 Monaco 一致。
- sticky scroll：点击后光标落到点中的 token，并滚到 sticky 区下方。
- 性能：2 万行粘贴约 130ms。
- 括号：括号匹配高亮、彩虹括号、Go to Bracket、闭括号回缩和回车都跳过字符串、注释、正则、模板串里的括号（`${}` 里的代码照常算）。新增 Select to Bracket（只在面板里，无默认键）；Remove Brackets 绑 ⌥⌘⌫ / Ctrl+Alt+Backspace。
- minimap：按 Monaco 的方式画 CJK、emoji 等非 ASCII 字符，全角占两格；不折行时也隐藏折叠体。查找框的右偏移跟随 minimap 的实际宽度，关掉 minimap 时也对。
- sticky scroll：TS/JS 用语言服务的 navigation tree 作为作用域（对齐 Monaco 的 outlineModel），if、for、switch 等语句块不再上榜；语言服务没就绪或非 TS 语言时退回折叠范围。
- TS 同符号高亮对齐 Monaco WordHighlighter：多行选区、越过词的选区、程序设置的选区和打字后不显示，约 300ms 后出现，失焦时保留。
- 新命令：Fold All Block Comments、Fold / Unfold All Regions、Fold / Unfold All Except Selected、Toggle Fold Recursively、Remove Manual Folding Ranges（手建折叠块单独存放，不被 TS outlining 冲掉）；Add / Remove Line Comment；Detect Indentation、Indent Using Spaces / Tabs、Change Tab Display Size、Convert Indentation to Spaces / Tabs、Reindent Lines / Selected Lines。折叠后落进隐藏区的光标挪到块首行行尾。
- 命令面板去掉 Monaco 没有的 Undo / Redo / Copy / Cut / Paste / Select All；Go to Symbol 的标签改为 "Go to Symbol..."。
- 渲染：同一事务里装饰换了行（同符号高亮、查找、缩进参考线、折叠等）时，旧行不再残留、新行照常画。
- 性能：特殊字符、颜色块、行尾空白只在文档或视口变化时重算；选区坐标走行索引（大范围拖选不再 O(n²)）；minimap 同词按词缓存；sticky 作用域停手后才重算；token 增量重扫用 StateStack.equals 判断收敛，并修正整篇替换、多光标、连续事务、窗口截断后下方行留着旧 token；括号跳过直接用高亮留下的 token 类型，TS/JS 用语法树判断正则和字符串，顶层括号首次查找从 20–40ms 降到 3ms 以内。
- 性能：2 万行拖选自动滚，主线程耗时从 Monaco 的 2.2 倍降到约 1.3 倍。量坐标共用一个 Range（每个留着等 GC 的 Range 都会拖慢后续每次 DOM 增删）；行索引按行缓存 doc 长，DOM 改动只作废被碰到的行；鼠标出了上下沿时 mousemove 不再 dispatch 选区，交给滚动帧（同 Monaco）；minimap 滚动时平移上一帧，只画新露出的行（同 Monaco `_renderUntouchedLines`）；语法色、彩虹括号、缩进参考线在 doc、视口、token 都没变时复用上一份装饰；sticky scroll 不再因只动选区的事务重算。
- 拖选到左右边缘不再定时横向滚动，照 Monaco 出界落到行首或行尾并滚到光标处；列选同样。滚轮每格 50px，⌥ 加速、⇧ 横滚与 Monaco 一致；行号栏和 minimap 上也能滚。
- 开着 sticky scroll 时光标 reveal 上下留 5 行余量；peek 打开时的滚动位置与 Monaco 一致。
- 折叠：手建块和缩进 / TS outlining 块交叉时照 Monaco sanitizeAndMerge 只留手建块；缩进块和 `#region` 块照 Monaco computeRanges 一遍算出；新增 `foldingMaximumRegions`（默认 5000）；TS 里平齐的注释块不再能折；TS 补充块收尾行以 `} ] ) \` >` 开头时留着收尾行。
- 缩进：indentSize 默认跟随 tabSize（Monaco `'tabSize'`），改 Tab 显示宽度后 Tab、退格、参考线跟着变；退格在前导空白里按 indentSize 停靠；缩进参考线跟缩进选项走。新增 `autoIndentFacet`，设为 `'full'` 时回车、行首闭括号、if 下一行的 `{`、空白行上的 Tab 按 indentationRules 调缩进；Reindent 不被字符串、注释、正则里的括号带偏；块注释和模板串里的行首敲闭括号不回缩；行首闭括号回缩保留光标后的空白。TS 格式化的缩进宽度用 indentSize，codefix 用 tabSize，Tab 缩进时输出 `\t`。
- minimap：字格（dpr≥2 一律 scale 2）、滑块取整与 Monaco 一致；空选区不画当前行块；同词高亮只在聚焦时由用户挪光标触发、区分大小写，TS 下只画语义引用。查找框右偏移 = 2 × 竖条宽 + minimap 宽，右侧没有竖条或概览列时也对。
- 同词与选中串：拆成 WordHighlighter（整词、区分大小写、只看主选区）和 SelectionHighlighter（子串、不分大小写、多选区要求文本相同），失焦保留（选中串变淡）。TS 同词高亮区分读写（`cm-wordHighlightText` / `cm-wordHighlightStrong`），在注释和关键字上退回文本同词。概览尺照 Monaco 分 lane 画同词、选中串、括号、查找和诊断。
- sticky scroll：JSON、CSS、SCSS、LESS、HTML 有和 Monaco 一致的层级；只算完整可见的行。
- 浮层：宿主快捷键在查找、替换、重命名、命令面板的输入框里也能用；hover 卡默认在上方，按整行高度定位；peek 显示在目标行下方；Quick Fix 改成贴着光标或灯泡的下拉菜单，⌘. 没有可用操作时提示「No code actions available」；补全列表滚动时保持方向和高度，按窗口空间决定上下，可伸出编辑器。
- 灯泡照 Monaco 改为光标停下 250ms 后只问光标处诊断的 quick fix，打字时不再触发全文类型检查（2700 行文件打字时的长任务从 80ms 降到 14ms），单次请求限时 30ms。
- TS hover：诊断码写成 `(6387)`；`{@link}` 原样显示；`@param` 段落与 Monaco 一致；废弃 API 的卡里有「声明在这里被标为废弃」的跳转行。
- diff 编辑器的替换键在 Mac 上改为 ⌥⌘F。命令面板读屏用的快捷键写成 Command+K；Win/Linux 上方向键写成 UpArrow。

## 0.3.0 — 2026-07-19

### Endpoint（嵌入 Monaco 替代）

- `ENDPOINT.md` 条件全满足；DEVICE 自动层 `device-path.test.ts`
- 狗粮宿主：`markloom/lab` 挂 `lite-monaco`（Code 面板）
- `API-STABLE.md` stable / experimental 冻结

## 0.2.0 — 2026-07-19

### Added
- **`lite-monaco/monaco-shim`**：`create` / `createDiffEditor` / getValue·setValue·onDidChangeModelContent（迁移薄层）
- **`MIGRATION.md`**：Monaco → lite-monaco 对照与摩擦清单
- **`examples/react-basic.tsx`**：最小 React 挂载示例
- **`ROADMAP.md` / `SCAN-ACCEPT-2026-07-19.md`**：迭代与验收

### Docs
- README：配置面、API 稳定标注、性能体积
- `src/ARCHITECTURE.md`：源码分层

### Notes
- 公开 npm 导出：`.` + `./monaco-shim`
- 主路径 demo（`/` · `/cm7.html`）零 monaco 运行时依赖；`/diff.html` 对照仍 dev 用 monaco

## 0.1.1 — 2026-07-18

- DiffEditor：fill 差量、回车不抖、gutter ± 行号右
- 查找 / RO 提示 / 文档

## 0.1.0 — 2026-07-18

- 首发 MVP：`lite-monaco`（`litcode` 名冲突）
- CM7 + Shiki + TS 路径 + DiffEditor 初版
