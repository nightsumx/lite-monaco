---
title: Bundle size compared with monaco-editor
description: lite-monaco is 526 KB gzip against 1050 KB for monaco-editor 0.55.1 (editor.main up front plus editor.worker), both with the same esbuild settings and code splitting.
---

# Bundle size compared with monaco-editor

Measured 2026-11-24 with esbuild minification, code splitting and gzip -9. Counted is what loads before an editor shows. Neither side includes a highlighter or the TypeScript compiler.

| | minified | gzip |
|---|---|---|
| lite-monaco (main bundle) | 1.68 MB | **526 KB** |
| monaco-editor 0.55.1 (`editor.main` + `editor.worker`) | 3.75 MB + 0.28 MB | 962 + 88 = **1050 KB** |

## How it is measured

- The same esbuild version and the same minify settings for both.
- Code splitting on for both, as Vite and webpack do by default. What loads later is not counted: monaco-editor's 81 Monarch languages and its language-service entry points (158 KB), lite-monaco's icon font (47 KB) and its JSON / CSS / HTML glue (7 KB).
- monaco-editor cannot run without `editor.worker`, so the worker is counted.
- The icon fonts are left out on both sides: lite-monaco loads its codicon font as a separate chunk when the first editor mounts, and monaco-editor ships `codicon.ttf` as a separate file.
- To re-measure, clone the repository and run `node site/measure.mjs`.

Until 2026-11-24 this page compared against `editor.main` bundled as a single file, 1113 KB (1201 KB with the worker). That counts the languages Monaco would load on demand, which a splitting bundler does not put up front, so it overstated Monaco by about 150 KB.

## What is not counted

For TypeScript completion and diagnostics, both sides need the TypeScript compiler: monaco-editor ships it as `ts.worker` (1.54 MB gzip), lite-monaco uses the optional `typescript` dependency you install. It is the same cost either way, so it is left out.

Highlighting is not counted either: Shiki loads each grammar and theme the first time it is used.

## Why it is smaller

The core is ported from CodeMirror 6 with Monaco's API on top, instead of the VS Code platform layers (services, instantiation, the worker host) that `editor.main` carries. What that leaves out is listed in [Differences from Monaco](/docs/differences/).
