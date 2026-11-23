---
title: Bundle size compared with monaco-editor
description: lite-monaco is 523 KB gzip against 1201 KB for monaco-editor 0.55.1 (editor.main plus editor.worker), measured with the same esbuild settings.
---

# Bundle size compared with monaco-editor

Measured 2026-11-23 with esbuild minification and gzip -9. Neither side includes a highlighter or the TypeScript compiler.

| | minified | gzip |
|---|---|---|
| lite-monaco (main bundle) | 1.68 MB | **523 KB** |
| monaco-editor 0.55.1 (`editor.main` + `editor.worker`) | 4.30 MB + 0.28 MB | 1113 + 88 = **1201 KB** |

## How it is measured

- The same esbuild version and the same minify settings for both.
- monaco-editor cannot run without `editor.worker`, so the worker is counted.
- The icon fonts are left out on both sides: lite-monaco loads its codicon font as a separate chunk when the first editor mounts, and monaco-editor ships `codicon.ttf` as a separate file.
- To re-measure, clone the repository and run `node site/measure.mjs`.

## What is not counted

For TypeScript completion and diagnostics, both sides need the TypeScript compiler: monaco-editor ships it as `ts.worker` (1.54 MB gzip), lite-monaco uses the optional `typescript` dependency you install. It is the same cost either way, so it is left out.

Highlighting is not counted either: Shiki loads each grammar and theme the first time it is used.

## Why it is smaller

The core is ported from CodeMirror 6 with Monaco's API on top, instead of the VS Code platform layers (services, instantiation, the worker host) that `editor.main` carries. What that leaves out is listed in [Differences from Monaco](/docs/differences/).
