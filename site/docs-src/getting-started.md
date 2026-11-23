---
title: Getting started
description: Install lite-monaco, create a Monaco-compatible code editor or diff editor in a few lines, with no web workers or bundler plugins to configure.
---

# Getting started

lite-monaco is a code editor with the `monaco-editor` API: `monaco.editor`, `monaco.languages`, `monaco.Uri`, `monaco.Range`, `monaco.KeyCode` have the same names and shapes. If you know Monaco, you already know it. If you are moving an existing app, read [Migrating from monaco-editor](/docs/migrate-from-monaco/).

## Install

```bash
npm i lite-monaco shiki
```

`shiki` does the syntax highlighting, loading each language and theme the first time it is used. Without it the editor still works, just without colors.

On Vite 8, also `npm i vscode-uri` for now: 0.4.0's production build fails without it ([details](/docs/language-features/)).

## Create an editor

```ts
import * as monaco from 'lite-monaco'

const editor = monaco.editor.create(document.getElementById('container')!, {
  value: 'const hello = "world"\n',
  language: 'typescript',
  theme: 'vs-dark',
  automaticLayout: true,
})

editor.onDidChangeModelContent(() => console.log(editor.getValue()))
```

The container needs a definite height, as with Monaco:

```html
<div id="container" style="height: 400px"></div>
```

That is the whole setup. There is no `MonacoEnvironment.getWorker`, no worker loader and no bundler plugin. This site is built with esbuild and the [StackBlitz template](https://stackblitz.com/github/nightsumx/lite-monaco/tree/main/templates/vite) with Vite, both without any editor-specific configuration.

## Diff editor

```ts
const diff = monaco.editor.createDiffEditor(el, { renderSideBySide: true, automaticLayout: true })
diff.setModel({
  original: monaco.editor.createModel(before, 'typescript'),
  modified: monaco.editor.createModel(after, 'typescript'),
})
```

Side-by-side and inline modes, collapsed unchanged regions, moved blocks and Revert Block are all there. The options are Monaco's `IDiffEditorOptions`.

## Themes

`vs`, `vs-dark`, `hc-black` and `hc-light` work as theme names; they map to Shiki's Light+, Dark+ and the closest high-contrast themes. `monaco.editor.defineTheme` supports `rules`, `colors` and `inherit`.

## Next

- [Language features](/docs/language-features/): TypeScript IntelliSense, JSON schemas, CSS and HTML, Monarch.
- [Using it with @monaco-editor/react](/docs/react/)
- [Differences from Monaco](/docs/differences/): read this before you ship.
