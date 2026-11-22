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

用 `@monaco-editor/react` 的，不用卸 monaco-editor 的那些 worker 配置（它默认走 CDN，本来就没有），加两行就行：

```ts
import { loader } from '@monaco-editor/react'
import * as monaco from 'lite-monaco'
loader.config({ monaco })
```

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
- 没有 `languages.typescript.getTypeScriptWorker()`。

### JSON / CSS / HTML

- 用的是和 Monaco 相同的 `vscode-*-languageservice`，只是跑在主线程，第一次用到该语言时才加载。
- `monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ schemas })` 这类配置不用改。
- 没装对应包时，这个语言只有高亮，控制台会提示一次。

### 输入和无障碍

- 输入层是 contenteditable，不是隐藏的 textarea。直接查 `.inputarea` 或 `textarea` 的代码要改，用 `editor.onKeyDown`、`onDidPaste` 这类 API。
- 输入法组字过程中 model 不变，提交时一次写入。依赖组字中间态 `onDidChangeModelContent` 的代码会看到更少的事件。
- 读屏用的 role、aria 属性对齐了，无障碍树结构不同。

### DOM 和样式

- 编辑器的 DOM 结构和 class 名和 Monaco 不同。用 CSS 改 `.monaco-editor .view-lines` 这类内部结构的样式要重写；颜色请走 `defineTheme` 的 `colors`。
- 容器要有确定的高度，和 Monaco 一样。

## 没有的

- `editor.createWebWorker`、`languages.*.getWorker`：没有 Monaco 的 worker 宿主。
- `editor.createMultiFileDiffEditor`：只有单文件 Diff。
- Diff 的 accessible diff viewer（F7 读屏视图）。
- `accessibilityPageSize` 分页。

遇到上面没写的不一致，就是 bug。
