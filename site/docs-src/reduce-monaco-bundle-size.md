---
title: How to reduce monaco-editor's bundle size
short: Reducing Monaco's size
description: Measured on monaco-editor 0.55.1: what code splitting, editor.api and picked features save, and why picking features stops working once you add JavaScript.
---

# How to reduce monaco-editor's bundle size

`import * as monaco from 'monaco-editor'` pulls in `editor.main`: every editor feature, 81 Monarch languages and four language services. The usual advice is to import less. Here is what each step actually saves on monaco-editor 0.55.1, and where it stops working.

All numbers are gzip -9 of esbuild's minified output, JavaScript only, with code splitting on. "Up front" is what has to load before the editor can show. Measured 2026-11-24; to re-measure, run `node site/measure.mjs` in the [repository](https://github.com/nightsumx/lite-monaco).

| Setup | Up front |
|---|---|
| `monaco-editor` (`editor.main`) | 962 KB, then 165 KB of languages on demand |
| `edcore.main`: all features, no languages | 935 KB |
| `editor.api` + 7 features + JavaScript | 935 KB |
| `editor.api` + 7 features + Go | 790 KB |
| `editor.api` alone: no find, suggest or hover | 655 KB |
| [lite-monaco](/docs/getting-started/): all of the above, diff editor | 523 KB |

Every monaco-editor row also needs `editor.worker`, another 88 KB; lite-monaco has no worker.

The 7 features are find, folding, suggest, hover, bracket matching, comment and multicursor. TypeScript IntelliSense is not in any row: monaco-editor's `ts.worker` is 1543 KB on its own and only loads when a TypeScript model needs it.

## 1. Let your bundler split

Bundled as a single file, `editor.main` is 1113 KB. With code splitting, the 81 Monarch definitions and the language-service entry points move into chunks that load the first time a language is used, so 962 KB is left up front. Vite and webpack split dynamic imports by default; with esbuild, pass `splitting: true` and `format: 'esm'`.

This is the one step that is free: nothing changes in your code.

## 2. Import editor.api and pick features

Instead of `monaco-editor`, import the bare API and the features you want:

```ts
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution'
```

`editor.api` alone is 655 KB: an editor that shows and edits text, without a find widget, completion or hover. Each feature you add back costs between a few KB and about 75 KB (hover is the largest). `monaco-editor-webpack-plugin`'s `features` option does the same thing for webpack.

### Why it stops working when you add a language

In 0.55, every `*.contribution.js` file imports all 58 editor features: the Monarch ones (`basic-languages/*/*.contribution.js`, which `_.contribution.js` backs) and the language services (`language/typescript/monaco.contribution.js` and the JSON, CSS and HTML ones). Import any of them, and the feature list you picked is back to all of it. This was not the case in 0.52.

You can register a language yourself from its Monarch definition instead of its contribution file:

```ts
import { conf, language } from 'monaco-editor/esm/vs/basic-languages/go/go'

monaco.languages.register({ id: 'go', extensions: ['.go'] })
monaco.languages.setLanguageConfiguration('go', conf)
monaco.languages.setMonarchTokensProvider('go', language)
```

That works for 71 of the 81 definitions. The other 10 import all features themselves, because they use runtime values from Monaco's API: TypeScript (and therefore JavaScript, which builds on it), Python, HTML, XML, YAML, Razor, Handlebars, Liquid, MDX and FreeMarker. With JavaScript, the 7-feature build is 935 KB again, the same as taking everything. The way around that is to copy the definition into your code (it is MIT) and import the values from `editor.api` yourself.

So the realistic floor for a Monaco with search, completion, hover and folding is around 790 KB up front plus the 88 KB editor worker, and only if none of your languages is one of those 10.

## 3. Load it later, or from a CDN

Neither makes Monaco smaller, but both take it off the path to your first paint:

- **Lazy-load the editor**: `const monaco = await import('monaco-editor')` when the editor is about to appear, not in your entry chunk.
- **A CDN** (`@monaco-editor/loader` loads it from jsDelivr by default): your bundle loses Monaco entirely, your users still download it, from a second origin, and you depend on that origin being reachable.

## 4. Use an editor with the same API that is smaller to begin with

[lite-monaco](/) is a drop-in replacement for monaco-editor: the same `monaco.editor` and `monaco.languages` API, checked against Monaco's own 3279 applicable unit tests. Its core is 523 KB with every feature in the table above and the diff editor, and there is no worker to configure, because it is not built on the VS Code platform layers that make up most of `editor.main`.

```ts
// before
import * as monaco from 'monaco-editor'
// after
import * as monaco from 'lite-monaco'
```

What it changes and what it leaves out is in [Migrating from monaco-editor](/docs/migrate-from-monaco/) and [Differences from Monaco](/docs/differences/). How the 523 KB is measured is in [Bundle size](/docs/bundle-size/).
