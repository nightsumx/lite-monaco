---
title: Using lite-monaco with @monaco-editor/react
description: Keep your @monaco-editor/react components and hand them lite-monaco with loader.config({ monaco }) - no CDN loading, no workers.
---

# Using lite-monaco with @monaco-editor/react

[`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react) loads Monaco from a CDN unless you give it a `monaco` instance. Give it lite-monaco and your components stay exactly as they are:

```bash
npm i lite-monaco shiki
```

```tsx
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'lite-monaco'

loader.config({ monaco }) // no more loading Monaco from a CDN

export const CodeEditor = () => (
  <Editor height={360} defaultLanguage="typescript" defaultValue="const a = 1" />
)
```

Call `loader.config` once, before the first editor mounts; module scope next to your imports is the usual place.

## What works

Checked against `@monaco-editor/react` 4.7.0:

- `Editor` and `DiffEditor`
- `useMonaco`
- `beforeMount`, `onMount`, `onChange`, `onValidate`
- multiple models through the `path` prop

The `monaco` you receive in `beforeMount` / `onMount` and from `useMonaco` is the lite-monaco module, so `monaco.languages.*` configuration (JSON schemas, `typescriptDefaults`, `defineTheme`) is done there as usual.

## Remove what is no longer needed

If you configured Monaco's workers for the React wrapper (`self.MonacoEnvironment`, `?worker` imports, a Monaco bundler plugin), delete them. lite-monaco does not use them.

See also [Differences from Monaco](/docs/differences/).
