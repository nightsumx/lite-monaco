# lite-monaco

[English](./README.md) · 中文

Monaco 的手感，不到一半的体积。

`lite-monaco` 是 [monaco-editor](https://github.com/microsoft/monaco-editor) 的平替：`monaco.editor`、`monaco.languages` 同名同形，一行 import 换掉，不用配 worker。

**官网（页面上的编辑器都是真的）：https://lite-monaco.dev**

- **同一套 API**：`editor.create`、`createModel`、`createDiffEditor`、`defineTheme`、`setModelMarkers`、`languages.register*Provider`、Monarch……对照 Monaco 0.55.1 的 `monaco.d.ts` 机器校验。
- **拿 Monaco 自己的测试验收**：VS Code 仓库 `src/vs/editor` 下 3863 条单元测试原样接上来跑，适用的 3279 条全部通过；其余 584 条测的是 VS Code 服务层或渲染器内部，每条都写了不适用的理由。
- **体积**：核心 gzip 523 KB（图标字体 47 KB 另算，挂载时加载）。同样的 esbuild 压缩下，monaco-editor 的 `editor.main` 加 `editor.worker` 是 1201 KB。
- **不用 worker**：没有 `MonacoEnvironment.getWorker`，没有打包器的 worker loader。

## 安装

```bash
npm i lite-monaco shiki
```

`shiki` 负责语法高亮，按语言和主题懒加载。不装也能用，只是没有颜色。

## 用法

```ts
import * as monaco from 'lite-monaco' // 原来是 'monaco-editor'

const editor = monaco.editor.create(document.getElementById('container')!, {
  value: 'const hello = "world"\n',
  language: 'typescript',
  theme: 'vs-dark',
  automaticLayout: true,
})

editor.onDidChangeModelContent(() => console.log(editor.getValue()))
```

容器要有确定的高度，和 Monaco 一样。

### Diff 编辑器

```ts
const diff = monaco.editor.createDiffEditor(el, { renderSideBySide: true, automaticLayout: true })
diff.setModel({
  original: monaco.editor.createModel(before, 'typescript'),
  modified: monaco.editor.createModel(after, 'typescript'),
})
```

并排和行内两种模式，折叠未改区、移动块、Revert Block 都有，选项同 Monaco 的 `IDiffEditorOptions`。

## 按需加的能力

都是可选依赖，装了就生效，不装不影响别的。

| 想要 | 装 | 说明 |
|---|---|---|
| TypeScript / JavaScript 补全、hover、诊断、跳转、重命名、Quick Fix | `npm i typescript` | 默认跑在主线程。要放进 Worker，见下文 |
| JSON 校验、补全（含 JSON Schema） | `npm i vscode-json-languageservice vscode-languageserver-types vscode-uri` | 配置走 `monaco.languages.json.jsonDefaults` |
| CSS / SCSS / Less 补全、hover、校验 | `npm i vscode-css-languageservice vscode-languageserver-types` | `monaco.languages.css.*Defaults` |
| HTML 补全、hover、格式化 | `npm i vscode-html-languageservice vscode-languageserver-types` | `monaco.languages.html.*Defaults` |
| Monarch 高亮（81 种语言，不用 Shiki） | 不用装 | `import 'lite-monaco/basic-languages'` |

### TypeScript 放进 Worker

```ts
// ts.worker.ts
import { startTsWorker } from 'lite-monaco/ts-worker'
startTsWorker()
```

```ts
// 主线程，建编辑器之前
import { setTsWorker } from 'lite-monaco'
setTsWorker(() => new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' }))
```

TypeScript 的标准库（`lib.*.d.ts`）默认从 jsDelivr 取。离线或内网环境用 `setTsLibLoader()` 自己提供。

## 和 Monaco 的已知差异

- **输入层**：Monaco 用隐藏的 textarea / EditContext，lite-monaco 用 contenteditable。读屏用的 role 和 aria 属性对齐了，无障碍树的结构不同。VoiceOver、NVDA、JAWS 还没测过。
- **输入法**：Monaco 组字过程中每次更新都改 model，lite-monaco 到提交时才改。提交后的结果一致。
- **没有的 API**：`createWebWorker`（顶层和 `editor.*`）、`lsp`、`typescript.getTypeScriptWorker` / `getJavaScriptWorker` / `typescriptVersion`、`editor.createMultiFileDiffEditor`，理由见 MIGRATION.md。
- **浏览器**：Chromium、Firefox、WebKit 都和真 Monaco 逐场景比对过（Playwright 构建）。真 Safari、真触摸屏还没验证。

逐项说明和迁移步骤见 [MIGRATION.md](./MIGRATION.md)。

## 体积

esbuild 压缩、gzip -9，2026-11-23 实测（`node site/measure.mjs`），两边都不含高亮器和 TypeScript 编译器：

| | 压缩后 | gzip |
|---|---|---|
| lite-monaco（主包；图标字体 47 KB 是单独一块，第一个编辑器挂载时才加载） | 1.68 MB | **523 KB** |
| monaco-editor 0.55.1（`editor.main` + `editor.worker`；字体 codicon.ttf 也是单独的文件，不在这里） | 4.30 MB + 0.28 MB | 1113 + 88 KB |

要 TypeScript 智能时两边都得带编译器：monaco-editor 是 ts.worker（gzip 1.54 MB），lite-monaco 是你装的 `typescript`。

## React

自带 `lite-monaco/react`，导出和 [`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react) 4.7.0 一样（默认导出 `Editor`，加 `DiffEditor`、`useMonaco`、`loader` 和类型），从它迁过来只改 import：

```tsx
import Editor from 'lite-monaco/react'

export const CodeEditor = () => <Editor height={360} defaultLanguage="typescript" defaultValue="const a = 1" />
```

- 不用 `loader.config`，也不从 CDN 加载；`onMount` 拿到的 monaco 就是 `import * as monaco from 'lite-monaco'` 那一个。
- 编辑器在第一次绘制前就建好，没有「Loading...」那一帧（`loading` 只在服务端渲染的 HTML 里看得到）。
- StrictMode 下只建一次，留下的编辑器是活的；卸载时按最新的 `path` / `keepCurrentModel` / `saveViewState` 处理。
- props、默认值、生效时机、`onChange` / `onValidate` 的触发条件都和它一样：`scripts/browser-diff/react/run.mjs` 在真 Chrome 里拿「@monaco-editor/react + monaco-editor 0.55.1」当基准，45 个场景（React 19 和 18）逐项对比，有意不同的几处列在脚本的 `ACCEPTED` 里。

`react` 是可选的 peer 依赖（>= 18），不用 React 不会装。已经在用 `@monaco-editor/react`、暂时不想换 import 的，把 lite-monaco 交给它的 loader 也行：

```tsx
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'lite-monaco'

loader.config({ monaco })
```

## 开发

```bash
npm ci
npm test            # 自有的 6000 多条单测（vitest + jsdom）
npm run build       # tsc 检查 + tsup 打包到 dist/
node site/build.mjs # 官网，预览：python3 -m http.server -d site
```

Monaco 原版单测的对照（`PARITY.md` 里的 3279/3279）要一份 VS Code 源码的检出，跑法见 [`__parity__/README.md`](./__parity__/README.md)。

## License

MIT。独立项目，与微软、Monaco Editor、VS Code 无关；Monaco 和 VS Code 是微软的产品名，这里只用来说明手感对标谁。内核移植自 CodeMirror 6，部分代码来自 Monaco Editor / VS Code（均为 MIT），原版权声明见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
