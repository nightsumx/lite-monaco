---
title: Monaco editor without web workers
short: Monaco without workers
description: Why monaco-editor needs MonacoEnvironment.getWorker, what its worker errors mean, the setup for Vite and webpack, and a Monaco-compatible editor with no workers.
---

# Monaco editor without web workers

monaco-editor runs part of its work in web workers, and it cannot find them by itself: your page has to tell it where each worker is. If it does not, you see one of these in the console:

```text
Error: You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker
```

```text
Could not create web worker(s). Falling back to loading web worker code in main thread, which might cause UI freezes.
```

Both messages are from monaco-editor 0.55.1. The first means no worker was configured; the second means one was configured but the browser would not start it.

## What the workers do

- **`editor.worker`**, for every editor: computing diffs for the diff editor, finding links, word-based completion, Unicode highlighting.
- **`json.worker`, `css.worker`, `html.worker`, `ts.worker`**, one per language service: completion, hover, validation and formatting for that language. `ts.worker` carries the whole TypeScript compiler.

Each one is a separate script, so each one needs its own URL in your build.

## The setup per bundler

### Vite

```ts
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}
```

The `label` is the language the worker is for; anything that is not a language service gets `editor.worker`.

### webpack

`monaco-editor-webpack-plugin` emits the workers and sets `MonacoEnvironment` for you. Its `languages` option decides which language workers are built.

### esbuild, Rollup and others

Build each worker as its own entry point, then return its URL from `getWorkerUrl(_, label)`.

## Where it usually breaks

- **A CDN.** Browsers do not start a worker script from another origin. Loading Monaco from a CDN needs a same-origin shim, a `blob:` or `data:` URL that loads the worker code from the CDN.
- **Content Security Policy.** `worker-src` (or `script-src`, when `worker-src` is not set) has to allow where the workers come from, including `blob:` if you use the shim.
- **Server-side rendering.** There is no `Worker` and no `window` on the server, so Monaco has to be imported in the browser only, for example with `next/dynamic` and `ssr: false`.
- **Libraries and embeds.** A component that ships Monaco inside it has to make its consumers configure the workers too, or bundle them in a way that survives every consumer's bundler.

## Running it without workers

When Monaco cannot start a worker, it falls back to running the worker code on the main thread, which is the second warning above. Diffs, links and language services then run on the same thread as typing and scrolling, which is what "might cause UI freezes" refers to.

[lite-monaco](/) takes the other route: an editor with Monaco's API that has no worker host at all.

```ts
import * as monaco from 'lite-monaco'

monaco.editor.create(document.getElementById('container')!, {
  value: 'console.log("no workers")\n',
  language: 'javascript',
})
```

There is no `MonacoEnvironment`, no `?worker` import and no bundler plugin. Diffs and links run on the main thread; the JSON, CSS and HTML services are the same `vscode-*-languageservice` packages Monaco runs in its workers, loaded the first time their language is used. TypeScript runs on the main thread by default, and you can move it into a worker of your own with one call when you want it off the main thread ([how](/docs/language-features/#typescript-in-a-worker)).

The `monaco.editor` and `monaco.languages` API stays the same; the few things that are different are in [Differences from Monaco](/docs/differences/). Moving an existing app over is in [Migrating from monaco-editor](/docs/migrate-from-monaco/): swap the import and delete the worker setup.
