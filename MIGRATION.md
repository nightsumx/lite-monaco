# 从 monaco-editor 迁到 lite-monaco

对照的是 monaco-editor 0.55.1。

## 1. 换包

```bash
npm uninstall monaco-editor
npm i lite-monaco shiki
```

用到 TypeScript 智能、JSON / CSS / HTML 语言服务的，再装对应的可选依赖（见 [README](./README.md#按需加的能力)）。

## 2. 换 import，删 worker 配置

原来：

```ts
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}
```

现在：

```ts
import * as monaco from 'lite-monaco'
```

`monaco.editor.*`、`monaco.languages.*`、`monaco.Uri`、`monaco.Range`、`monaco.KeyCode` 这些调用不用改。打包器里给 monaco 配的插件（`vite-plugin-monaco-editor`、`monaco-editor-webpack-plugin`）也可以删掉。

用 `@monaco-editor/react` 的，把 import 换成 lite-monaco 自带的同名组件，props 不用改：

```ts
import Editor, { DiffEditor, useMonaco, loader } from 'lite-monaco/react' // 原来是 '@monaco-editor/react'
```

原来的 `loader.config(...)` 可以删掉（留着也不报错，什么都不做）。不想换 import 的，保留 `@monaco-editor/react`，加两行把 lite-monaco 交给它：

```ts
import { loader } from '@monaco-editor/react'
import * as monaco from 'lite-monaco'
loader.config({ monaco })
```

两种都对 4.7.0 实测过。换成 `lite-monaco/react` 多得到的：没有「Loading...」那一帧；StrictMode 下编辑器是活的（4.7 在 StrictMode 里拆掉以后不再建）；卸载时按最新的 props 处理。

## 3. 检查下面这些差异

### 高亮

Monaco 内置 Monarch 高亮；lite-monaco 默认用 Shiki（TextMate 语法，和 VS Code 同一套），语法和主题第一次用到时才加载，所以新建的编辑器会先无色显示一瞬间。

- 主题名 `vs`、`vs-dark`、`hc-black`、`hc-light` 照常用，对应 Shiki 的 Light+、Dark+ 和最接近的高对比主题。`defineTheme` 的 `rules`、`colors`、`inherit` 都支持。
- 想和 Monaco 的颜色逐个 token 一致，`import 'lite-monaco/basic-languages'`，用 monaco-editor 自带的那 81 种 Monarch 定义。
- 自己写的 `setMonarchTokensProvider` 照常工作。

### TypeScript

- 补全、hover、诊断等要另装 `typescript`。`typescriptDefaults` / `javascriptDefaults` 的 `setCompilerOptions`、`addExtraLib`、`setDiagnosticsOptions` 照常用。
- 默认跑在主线程。要隔离，按 README 用 `setTsWorker` 放进你自己的 Worker。
- 标准库 `lib.*.d.ts` 默认从 jsDelivr 取，离线环境用 `setTsLibLoader()`。
- 0.55 起的顶层 `monaco.typescript`、`monaco.json`、`monaco.css`、`monaco.html` 都有；旧位置 `monaco.languages.typescript` 等是同一个对象（Monaco 0.55 的 d.ts 把旧位置写成 `{ deprecated: true }`，运行时其实也挂着同一个对象，lite-monaco 照运行时做）。
- `setCompilerOptions` 收 `monaco.typescript.ModuleKind` 这类枚举（数值同 `typescript` 包），也照旧收 `typescript` 包的 `ts.ModuleKind`。
- `setModeConfiguration` 只有 `diagnostics` 和 `inlayHints` 两项生效（关掉就不出诊断 / 内嵌提示）；其余各项（补全、hover 等）由编辑器的 `features` 开关管，设了不报错，也不起作用。
- `onDidChange` 的回调不带参数，同 Monaco（以前给的是 defaults 对象本身）。
- 没有 `getTypeScriptWorker()` / `getJavaScriptWorker()` / `typescriptVersion`，见「没有的」。

### JSON / CSS / HTML

- 用的是和 Monaco 相同的 `vscode-*-languageservice`，只是跑在主线程，第一次用到该语言时才加载。
- `monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ schemas })` 这类配置不用改。
- 没装对应包时，这个语言只有高亮，控制台会提示一次。
- 跑在主线程，诊断比 Monaco 快；每个 model 的第一次校验等主线程空下来才跑（最多 100ms），不然 `@monaco-editor/react` 来不及订阅，`onValidate` 收不到第一次的结果。

### 自己注册的 provider

- `registerDefinitionProvider`、`registerFoldingRangeProvider`、`registerInlayHintsProvider`、`registerSelectionRangeProvider` 和补全一样按 Monaco 的打分匹配选择器（`language`、`scheme`、`pattern`，分高的先问，同分后注册的先问）；以前只看语言。
- provider 拿到的 `model.uri` 是编辑器上那个 model 的 URI（`createModel` 给的，或者没传 model 时编辑器自己建的 `inmemory://model/N`），同 Monaco；返回位置时用 `model.uri` 表示「本文件」。直接用 `liteMonaco({ fileName })` 的仍是 `fileName`。以前没传 `fileName` 时一律给占位的 `inmemory://model/1`，硬写这个字符串的 provider 要改成 `model.uri`。

### 输入和无障碍

- 输入层是 contenteditable，不是隐藏的 textarea。直接查 `.inputarea` 或 `textarea` 的代码要改，用 `editor.onKeyDown`、`onDidPaste` 这类 API。
- 输入法组字过程中 model 不变，提交时一次写入。依赖组字中间态 `onDidChangeModelContent` 的代码会看到更少的事件。
- 读屏用的 role、aria 属性对齐了，无障碍树结构不同。

### DOM 和样式

- 编辑器的 DOM 结构和 class 名和 Monaco 不同。用 CSS 改 `.monaco-editor .view-lines` 这类内部结构的样式要重写；颜色请走 `defineTheme` 的 `colors`。
- 容器要有确定的高度，和 Monaco 一样。

## 没有的

- `createWebWorker`、`editor.createWebWorker`：要配 monaco-editor 自己的 `editor.worker`（worker 那一侧的协议），lite-monaco 没有 worker 宿主。JSON 的 `json.getWorker()` 有（主线程上的同一套方法）。
- `lsp`（0.55 新加的 `monaco-lsp-client`，经 WebSocket / Worker 连 LSP 服务器）：没有。
- `typescript.getTypeScriptWorker()` / `getJavaScriptWorker()` / `typescriptVersion`：Monaco 把所有 model 同步进 worker，按 model 的 URI 查；lite-monaco 的 TS 项目只收挂在编辑器上的文件，照样做出来会给出对不上的结果。要跑 TS 的程序化查询，直接用 `typescript` 包。
- `editor.createMultiFileDiffEditor`：只有单文件 Diff（官方的类型也是 `any`，没有公开的形状）。
- Diff 的 accessible diff viewer（F7 读屏视图）。
- `accessibilityPageSize` 分页。

遇到上面没写的不一致，就是 bug。
