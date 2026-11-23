---
title: Using lite-monaco with React
description: lite-monaco/react is a drop-in for @monaco-editor/react - same exports and props, no loader, no CDN, no workers. Or keep @monaco-editor/react and hand it lite-monaco.
---

# Using lite-monaco with React

## lite-monaco/react

`lite-monaco/react` ships in the package, with the same exports as [`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react) 4.7.0: the default export `Editor`, plus `DiffEditor`, `useMonaco`, `loader` and the types. Migrating from it is an import change:

```bash
npm i lite-monaco shiki
```

```tsx
import Editor from 'lite-monaco/react'

export const CodeEditor = () => (
  <Editor height={360} defaultLanguage="typescript" defaultValue="const a = 1" />
)
```

- No `loader.config` and no CDN. The `monaco` that `beforeMount` / `onMount` receive and `useMonaco` returns is the same object as `import * as monaco from 'lite-monaco'`.
- The editor is created before the first paint, so there is no "Loading..." frame (`loading` only shows in server-rendered HTML).
- Under StrictMode it is created once, and the editor left behind is alive. Unmounting uses the latest `path`, `keepCurrentModel` and `saveViewState`.
- Props, defaults, timing, and when `onChange` / `onValidate` fire all match 4.7.0. A script compares 45 scenarios in real Chrome, on React 19 and 18, against `@monaco-editor/react` + `monaco-editor` 0.55.1.

`react` is an optional peer dependency (18 or later); it is not installed if you don't use React.

## Keeping @monaco-editor/react

`@monaco-editor/react` loads Monaco from a CDN unless you give it a `monaco` instance. Give it lite-monaco and your components stay exactly as they are:

```tsx
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'lite-monaco'

loader.config({ monaco }) // no more loading Monaco from a CDN

export const CodeEditor = () => (
  <Editor height={360} defaultLanguage="typescript" defaultValue="const a = 1" />
)
```

Call `loader.config` once, before the first editor mounts; module scope next to your imports is the usual place.

Checked against `@monaco-editor/react` 4.7.0: `Editor`, `DiffEditor`, `useMonaco`, `beforeMount`, `onMount`, `onChange`, `onValidate`, and multiple models through the `path` prop.

## Configuring languages

Either way, configure languages on the `monaco` you receive, as with Monaco: `monaco.json.jsonDefaults` for JSON schemas, `monaco.typescript.typescriptDefaults` for compiler options, `monaco.editor.defineTheme` for themes. The older `monaco.languages.json` / `monaco.languages.typescript` locations point to the same objects.

## Remove what is no longer needed

If you configured Monaco's workers for the React wrapper (`self.MonacoEnvironment`, `?worker` imports, a Monaco bundler plugin), delete them. lite-monaco does not use them.

See also [Differences from Monaco](/docs/differences/).
