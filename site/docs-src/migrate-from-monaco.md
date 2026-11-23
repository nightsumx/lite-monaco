---
title: Migrating from monaco-editor
description: Replace monaco-editor with lite-monaco - swap one import, delete the MonacoEnvironment worker setup, and check the few documented differences.
---

# Migrating from monaco-editor

Compared against monaco-editor 0.55.1.

## 1. Swap the package

```bash
npm uninstall monaco-editor
npm i lite-monaco shiki
```

If you use TypeScript IntelliSense or the JSON / CSS / HTML language services, also install the matching optional dependencies (see [Language features](/docs/language-features/)).

## 2. Swap the import, delete the worker setup

Before:

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

After:

```ts
import * as monaco from 'lite-monaco'
```

Calls into `monaco.editor.*`, `monaco.languages.*`, `monaco.Uri`, `monaco.Range` and `monaco.KeyCode` stay as they are. Bundler plugins for Monaco (`vite-plugin-monaco-editor`, `monaco-editor-webpack-plugin`) can go too.

On `@monaco-editor/react`, see [React](/docs/react/): two lines, and your components stay the same.

## 3. Check these differences

### Highlighting

Monaco has Monarch built in; lite-monaco uses Shiki by default (TextMate grammars, the same ones VS Code uses). Grammars and themes load the first time they are used, so a new editor shows uncolored text for a moment.

- `vs`, `vs-dark`, `hc-black` and `hc-light` work; they map to Shiki's Light+, Dark+ and the closest high-contrast themes. `defineTheme` with `rules`, `colors` and `inherit` is supported.
- For token-for-token Monaco colors, `import 'lite-monaco/basic-languages'` to use the 81 Monarch definitions that ship with monaco-editor.
- Your own `setMonarchTokensProvider` works as before.

### TypeScript

- Completion, hover and diagnostics need `typescript` installed. `typescriptDefaults` / `javascriptDefaults` with `setCompilerOptions`, `addExtraLib` and `setDiagnosticsOptions` work as before.
- It runs on the main thread by default. To isolate it, move it into your own worker with `setTsWorker` ([how](/docs/language-features/#typescript-in-a-worker)).
- The standard library `lib.*.d.ts` files come from jsDelivr by default; offline, use `setTsLibLoader()`.
- There is no `languages.typescript.getTypeScriptWorker()`.

### JSON / CSS / HTML

- The same `vscode-*-languageservice` packages Monaco uses, on the main thread, loaded the first time the language is used.
- Configuration such as `monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ schemas })` does not change.
- Without the package installed, the language gets highlighting only, and the console says so once.

### Input and accessibility

- The input layer is contenteditable, not a hidden textarea. Code that queries `.inputarea` or `textarea` has to change; use APIs such as `editor.onKeyDown` and `onDidPaste`.
- During IME composition the model does not change; the text is written once on commit. Code that relies on intermediate `onDidChangeModelContent` events during composition sees fewer of them.
- Screen-reader roles and aria attributes match; the accessibility tree is structured differently.

### DOM and styling

- The DOM structure and class names differ from Monaco's. CSS that targets internals such as `.monaco-editor .view-lines` needs rewriting; set colors through `defineTheme`'s `colors`.
- The container needs a definite height, as with Monaco.

## Not available

- `editor.createWebWorker`, `languages.*.getWorker`: there is no Monaco worker host.
- `editor.createMultiFileDiffEditor`: single-file diff only.
- The diff editor's accessible diff viewer (the F7 screen-reader view).
- `accessibilityPageSize` paging.

Anything else that behaves differently from Monaco is a bug: please [open an issue](https://github.com/nightsumx/lite-monaco/issues).
