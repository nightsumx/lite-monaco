# lite-monaco

English · [中文](./README.zh-CN.md)

The feel of Monaco at half the size.

`lite-monaco` is a drop-in replacement for [monaco-editor](https://github.com/microsoft/monaco-editor): `monaco.editor` and `monaco.languages` have the same names and shapes. Swap one import, and no workers to configure.

**Website (every editor on the page is the real thing): https://lite-monaco.dev**

- **The same API**: `editor.create`, `createModel`, `createDiffEditor`, `defineTheme`, `setModelMarkers`, `languages.register*Provider`, Monarch… checked by machine against Monaco 0.55.1's `monaco.d.ts`.
- **Accepted by Monaco's own tests**: the 3863 unit tests under `src/vs/editor` in the VS Code repo run unchanged; all 3279 that apply pass. The other 584 test VS Code's service layer or renderer internals, and each one has a written reason why it doesn't apply.
- **Size**: 526 KB gzip for the core (the 47 KB icon font is separate and loads on mount). With the same esbuild minification and code splitting, monaco-editor loads 962 KB of `editor.main` plus the 88 KB `editor.worker` before an editor shows: 1050 KB.
- **No workers**: no `MonacoEnvironment.getWorker`, no worker loader in your bundler.

## Install

```bash
npm i lite-monaco shiki
```

`shiki` does the syntax highlighting, loading languages and themes lazily. It works without it, just without colors.

## Usage

```ts
import * as monaco from 'lite-monaco' // was 'monaco-editor'

const editor = monaco.editor.create(document.getElementById('container')!, {
  value: 'const hello = "world"\n',
  language: 'typescript',
  theme: 'vs-dark',
  automaticLayout: true,
})

editor.onDidChangeModelContent(() => console.log(editor.getValue()))
```

The container needs a definite height, same as Monaco.

### Diff editor

```ts
const diff = monaco.editor.createDiffEditor(el, { renderSideBySide: true, automaticLayout: true })
diff.setModel({
  original: monaco.editor.createModel(before, 'typescript'),
  modified: monaco.editor.createModel(after, 'typescript'),
})
```

Side-by-side and inline modes, collapsed unchanged regions, moved blocks and Revert Block are all there; options are Monaco's `IDiffEditorOptions`.

## Optional features

All optional dependencies: install one and it takes effect; leave it out and nothing else is affected.

| You want | Install | Notes |
|---|---|---|
| TypeScript / JavaScript completion, hover, diagnostics, go to definition, rename, Quick Fix | `npm i typescript` | Runs on the main thread by default. To move it into a Worker, see below |
| JSON validation and completion (with JSON Schema) | `npm i vscode-json-languageservice vscode-languageserver-types vscode-uri` | Configure through `monaco.json.jsonDefaults` |
| CSS / SCSS / Less completion, hover, validation | `npm i vscode-css-languageservice vscode-languageserver-types` | `monaco.css.*Defaults` |
| HTML completion, hover, formatting | `npm i vscode-html-languageservice vscode-languageserver-types` | `monaco.html.*Defaults` |
| Monarch highlighting (81 languages, no Shiki) | nothing | `import 'lite-monaco/basic-languages'` |

`monaco.languages.json` and the other old locations are the same objects.

### TypeScript in a Worker

```ts
// ts.worker.ts
import { startTsWorker } from 'lite-monaco/ts-worker'
startTsWorker()
```

```ts
// main thread, before creating editors
import { setTsWorker } from 'lite-monaco'
setTsWorker(() => new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' }))
```

TypeScript's standard library (`lib.*.d.ts`) is fetched from jsDelivr by default. For offline or intranet setups, provide it yourself with `setTsLibLoader()`.

## Known differences from Monaco

- **Input layer**: Monaco uses a hidden textarea / EditContext; lite-monaco uses contenteditable. Roles and aria attributes for screen readers match, but the accessibility tree is structured differently. Not yet tested with VoiceOver, NVDA or JAWS.
- **IME**: Monaco updates the model on every composition update; lite-monaco only on commit. The committed result is the same.
- **APIs that aren't there**: `createWebWorker` (top-level and `editor.*`), `lsp`, `typescript.getTypeScriptWorker` / `getJavaScriptWorker` / `typescriptVersion`, `editor.createMultiFileDiffEditor`. Reasons are in MIGRATION.md.
- **Browsers**: Chromium, Firefox and WebKit have all been compared scenario by scenario against real Monaco (Playwright builds). Real Safari and real touch screens are not yet verified.

Item-by-item notes and migration steps are in [MIGRATION.md](./MIGRATION.md) (Chinese).

## Size

esbuild minified with code splitting, gzip -9, measured 2026-11-24 (`node site/measure.mjs`). Counted is what loads before an editor shows; neither side includes a highlighter or the TypeScript compiler:

| | Minified | gzip |
|---|---|---|
| lite-monaco (main bundle; the 47 KB icon font is a separate chunk, loaded when the first editor mounts) | 1.68 MB | **526 KB** |
| monaco-editor 0.55.1 (`editor.main` + `editor.worker`; its 81 languages split off and load on demand, 158 KB; the codicon.ttf font is also a separate file, not counted here) | 3.75 MB + 0.28 MB | 962 + 88 = **1050 KB** |

For TypeScript smarts both sides need the compiler: monaco-editor ships ts.worker (1.54 MB gzip); lite-monaco uses the `typescript` you install.

## React

`lite-monaco/react` is built in, with the same exports as [`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react) 4.7.0 (default export `Editor`, plus `DiffEditor`, `useMonaco`, `loader` and the types). Migrating from it is an import change:

```tsx
import Editor from 'lite-monaco/react'

export const CodeEditor = () => <Editor height={360} defaultLanguage="typescript" defaultValue="const a = 1" />
```

- No `loader.config` and no CDN; the monaco that `onMount` receives is the same one as `import * as monaco from 'lite-monaco'`.
- The editor is created before the first paint, so there's no "Loading..." frame (`loading` only shows in server-rendered HTML).
- Under StrictMode it's created once and the editor left behind is alive; unmounting uses the latest `path` / `keepCurrentModel` / `saveViewState`.
- Props, defaults, timing, and when `onChange` / `onValidate` fire all match it: `scripts/browser-diff/react/run.mjs` compares 45 scenarios (React 19 and 18) in real Chrome against "@monaco-editor/react + monaco-editor 0.55.1"; the few intentional differences are listed in the script's `ACCEPTED`.

`react` is an optional peer dependency (>= 18) and isn't installed if you don't use React. If you already use `@monaco-editor/react` and don't want to change imports yet, hand lite-monaco to its loader:

```tsx
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'lite-monaco'

loader.config({ monaco })
```

## Development

```bash
npm ci
npm test            # 6000+ unit tests of our own (vitest + jsdom)
npm run build       # tsc check + tsup bundle into dist/
node site/build.mjs # the website; preview with: python3 -m http.server -d site
```

Comparing against Monaco's original unit tests (the 3279/3279 in `PARITY.md`) needs a checkout of the VS Code source; see [`__parity__/README.md`](./__parity__/README.md).

## License

MIT. An independent project, not affiliated with Microsoft, Monaco Editor or VS Code; Monaco and VS Code are Microsoft product names, used here only to say what the feel is modeled on. The core is ported from CodeMirror 6, and parts of the code come from Monaco Editor / VS Code (both MIT); the original copyright notices are in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
