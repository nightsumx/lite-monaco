---
title: Language features
description: TypeScript IntelliSense, JSON schema validation, CSS and HTML services and 81 Monarch languages in lite-monaco, all optional and without web workers.
---

# Language features

Every language feature beyond highlighting is an optional dependency: install it and it is on, leave it out and that language gets highlighting only.

> **TypeScript 6, not 7.** `typescript@7` is the native (Go) compiler and has no JavaScript API, which the language service needs. Install `typescript@6`.

| You want | Install | Notes |
|---|---|---|
| TypeScript / JavaScript completion, hover, diagnostics, go to definition, rename, Quick Fix | `npm i typescript@6` | Main thread by default; can move into a worker (below) |
| JSON validation and completion, including JSON Schema | `npm i vscode-json-languageservice vscode-languageserver-types vscode-uri` | Configured through `monaco.languages.json.jsonDefaults` |
| CSS / SCSS / Less completion, hover, validation | `npm i vscode-css-languageservice vscode-languageserver-types` | `monaco.languages.css.*Defaults` |
| HTML completion, hover, formatting | `npm i vscode-html-languageservice vscode-languageserver-types` | `monaco.languages.html.*Defaults` |
| Monarch highlighting (81 languages, no Shiki) | nothing | `import 'lite-monaco/basic-languages'` |

## Highlighting

By default lite-monaco highlights with [Shiki](https://shiki.style) (TextMate grammars, as in VS Code). Each grammar and theme loads the first time it is used. If you would rather have Monaco's own colors token for token, import the Monarch definitions that ship with monaco-editor:

```ts
import 'lite-monaco/basic-languages'
```

They came over together with monaco-editor's own tokenizer tests, which all pass. `monaco.languages.setMonarchTokensProvider` works for your own languages too.

## TypeScript

```bash
npm i typescript@6
```

`monaco.languages.typescript.typescriptDefaults` and `javascriptDefaults` work as in Monaco:

```ts
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({ strict: true })
monaco.languages.typescript.typescriptDefaults.addExtraLib(
  'declare function greet(name: string): string',
  'file:///globals.d.ts',
)
```

### TypeScript in a worker

The TypeScript service runs on the main thread unless you move it. To move it into a worker you own:

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

### Offline: the standard library

TypeScript's standard library (`lib.*.d.ts`) is fetched from jsDelivr by default. Offline or on an intranet, provide it yourself with `setTsLibLoader()`, which takes a function returning a `Map` from file name to contents.

## JSON, CSS, HTML

The same `vscode-*-languageservice` packages that Monaco runs in its workers, here on the main thread and loaded the first time the language is used. Configuration is unchanged from Monaco, for example JSON schemas:

```ts
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  schemas: [{ uri: 'inmemory://schema/app.json', fileMatch: ['*'], schema: { type: 'object' } }],
})
```

Without the package installed, the language gets highlighting only and the console says so once.
