# lite-monaco + Vite

A minimal [lite-monaco](https://lite-monaco.dev) editor: Vite, TypeScript, no framework.

```bash
npm i && npm run dev
```

`src/main.ts` is the whole setup: `import * as monaco from 'lite-monaco'` and `monaco.editor.create(...)`, with no worker configuration. `shiki` adds syntax highlighting; `typescript` adds completion, hover and diagnostics (both optional).

Open it online: https://stackblitz.com/github/nightsumx/lite-monaco/tree/main/templates/vite
