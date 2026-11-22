# Monaco 原版单测 → lite-monaco 对齐

目标:把 VS Code `src/vs/editor/**/*.test.ts`(monaco-editor 0.55.1 = vscode `86f5a62`)原样跑在 lite-monaco 上,逐文件全绿。

```
MONACO_SRC=$HOME/Documents/reference/_vscode-src npx vitest run --config vitest.parity.config.ts <路径片段>
MONACO_SRC=$HOME/Documents/reference/_vscode-src node scripts/parity-report.mjs   # 重新生成 PARITY.md(会跑全部,慢;只在收尾跑)
```

## 垫片约定
- 原版测试 import 的 Monaco 内部模块(如 `../../browser/sortLinesCommand.js`)→ 只要存在 `__parity__/shims/<文件名>.ts`(basename,不含 `.js`)就自动映射。**新增垫片 = 新增文件,不改 vitest.parity.config.ts。**
- `range / position / selection / utils` 是纯值类型垫片,不算"接入"。
- 垫片的职责:把 Monaco 内部类/夹具翻译成 lite-monaco 的公开 API(`createEditor` / `createModel` / `editor.getAction(id).run()` / `editor.trigger`)或 core 命令。**垫片里不许实现被测行为**(那样是虚绿)。行为差异就改 `src/`。
- 已有:`testCodeEditor.ts`(withTestCodeEditor)、`testTextModel.ts`、`testCommand.ts`(LMCommand 协议:`lmCommand((editor, model) => ...)`)、`coreCommands.ts`、`editorCommon.ts`、`linesOperations.ts`(Action 类名→action id 的范例)。改共享垫片用小 Edit,别整文件重写(别的区域也在用)。

## 差异裁决
1. 原版测试是 Monaco 0.55.1 真实行为的权威。lite-monaco 与之不符 → 改 lite-monaco(`src/`),不改测试。
2. 例外:只有当 lite-monaco 的现有行为是**有注释/有自有测试明确声明的有意设计**(例如 ⌃T 走 Mac 原生换位),才保留,并改为"另加一个 Monaco 语义的 action/命令",不动旧入口。
3. 改动了既有行为 → 同步改 lite-monaco 自己的 `__tests__` 里对应预期,并在最终汇报里列出(对外 API 变化要点名)。
4. 架构上根本没有对应物的测试(测的是 Monaco 内部实现:PieceTree、ViewModel、WebWorker…)→ 在 `__parity__/na/<区域>.json` 追加 `{ "file": "路径子串", "reason": "…" }` 声明不做。reason 要具体,不能写"太难"。**不许为了凑数把能做的标 N/A。**
5. 个别用例依赖 Monaco 独有的服务/模型(例如 tokenization 注册表)而 lite-monaco 无对应 → 该用例可 `test.skip`?不行,不改原版测试文件(在仓库外)。要么在垫片里提供等价能力,要么整文件 N/A。
6. 文件里只有个别用例测的是内部规则、其余能正常对齐 → 用例级 N/A:在 `__parity__/na/cases.json` 追加 `{ "file": "路径子串", "test": "用例标题(精确)", "reason": "…" }`。只划这几条,同文件其余用例照常算分;`PARITY.md` 末尾会列出每条的理由。reason 必须说清「Monaco 里这条规则对应什么、lite-monaco 为什么没有」,能做的不许往里放。
7. 浏览器几何(真实布局、像素)jsdom 里测不了的,同样走 N/A 并写明。

## 纪律
- 不 commit。不改 `_vscode-src`。
- 改 `src/` 后:`npx tsc --noEmit -p .` 无报错;跑自有套件对应部分;不要让自有测试变红(整套并行时有几条计时断言偶发误报,单独重跑能过即可)。
- 不得破坏 filo 依赖的公开 API(`liteMonaco()`、Monaco 兼容 API、core.EditorView)。需要改对外行为时在汇报里点名。

## Monarch 分词测试(monaco-editor 仓库)
monaco-editor 0.58.0 的 `src/languages/definitions/*/*.test.ts`(86 个文件、88 个 `testTokenization`,约 3.3 万个 token 断言)原样跑在 lite-monaco 的 `src/basic-languages/` 上:
```
MONACO_EDITOR_SRC=$HOME/Documents/reference/monaco-editor npx vitest run --config vitest.monarch.config.ts
```
- 源码在仓库外(没有就 `curl -L https://codeload.github.com/microsoft/monaco-editor/tar.gz/refs/heads/main | tar xz --strip-components=1`,这里 git clone 走代理会失败)。
- 只换了 `test/testRunner`(`__parity__/monarch/testRunner.ts`,逻辑照搬,`node:test` 换成 vitest)以及 elixir 测试直接 import 的编辑器入口、`_.contribution`、`node:test`。
- `src/basic-languages/` 是 monaco-editor 的 basic-languages 定义原文(只改了 `../../../editor` 的 import),**不进主包**,入口 `lite-monaco/basic-languages`,需要 Monarch 分词的宿主自己 `import 'lite-monaco/basic-languages'`。它会为这些语言注册 Monarch 分词器。和 Shiki 同时能给一个语言分词时:**登记了分词器的语言渲染走分词器,不走 Shiki;没登记的走 Shiki;登记两个以后登记的生效;dispose 最后一个回到 Shiki**(2026-11-22 实测,固定在 `__tests__/basic-languages/shiki-vs-monarch.test.ts`)。所以 Filo 不要引它:引了,python / rust / go 这些现在由 Shiki 着色的语言会改成 Monarch 着色。
- 0.55.1 对照:`MONACO_EDITOR_SRC_0551=$HOME/Documents/reference/monaco-editor-0.55.1 npx vitest run --config vitest.monarch-0551.config.ts`(85 文件 / 86 用例);两版语言定义的差异清单见 `__parity__/monarch/VERSION-DIFF.md`。
- 常规套件里的单测(`__tests__/basic-languages/`):`langconfig`(全部 89 个语言 id 的 language configuration 逐项核对)、`shiki-vs-monarch`、`version-diff`、`build-entry`(读 `dist/`,没构建过就跳过)。
