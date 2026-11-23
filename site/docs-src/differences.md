---
title: Differences from Monaco
description: Every known difference between lite-monaco and monaco-editor - input layer, IME, accessibility, DOM, missing APIs, browser coverage - and how compatibility is tested.
---

# Differences from Monaco

A replacement is most dangerous when it only looks the same. Everything known to differ is listed here; anything else that behaves differently from monaco-editor 0.55.1 is a bug, please [open an issue](https://github.com/nightsumx/lite-monaco/issues).

## Known differences

- **Input layer.** Monaco uses a hidden textarea / EditContext; lite-monaco uses contenteditable. Screen-reader roles and aria attributes match, the accessibility tree is structured differently. Not yet tested with VoiceOver, NVDA or JAWS.
- **IME composition.** Monaco updates the model on every composition update; lite-monaco writes once on commit. The committed result is the same. Simulated over CDP, not verified with a real IME on a real device.
- **DOM and class names.** They differ from Monaco's. Style through `defineTheme`'s `colors`, not CSS on internals like `.monaco-editor .view-lines`.
- **Missing APIs.** `editor.createWebWorker`, `languages.*.getWorker`, `languages.typescript.getTypeScriptWorker()`, `editor.createMultiFileDiffEditor`, the diff editor's accessible diff viewer (F7), `accessibilityPageSize` paging.
- **Browsers.** The Playwright builds of Chromium, Firefox and WebKit are tested. Real Safari and real touch screens (selection handles, soft keyboards) are not verified.
- **TypeScript.** Needs the optional `typescript` dependency, and runs on the main thread unless you move it into a worker ([how](/docs/language-features/#typescript-in-a-worker)).

## How compatibility is tested

### Monaco's own unit tests

157 test files and 3863 cases from `src/vs/editor` in the VS Code repository run unchanged against lite-monaco. All 3279 that apply pass. The other 584 test VS Code's service layer or renderer internals; each one is listed with a written reason in [PARITY.md](https://github.com/nightsumx/lite-monaco/blob/main/PARITY.md).

monaco-editor's tokenizer tests for the 81 Monarch languages pass as well: 88/88 on 0.58.0, 86/86 on 0.55.1.

### Side by side in real browsers

The same scene scripts (typing, selection, wrapping, folding, completion, diff, RTL, simulated IME, clipboard, touch…) run on Monaco 0.55.1 and on lite-monaco, comparing DOM geometry, caret positions and the accessibility tree:

| Browser | identical scenes |
|---|---|
| Chromium | 201 / 353 |
| Firefox 151 | 232 / 338 |
| WebKit 26.5 | 227 / 338 |

Not identical does not mean wrong: every Firefox and WebKit difference is classified as intentional or as one of Monaco's own quirks; on Chromium the diff and IME groups still have unclassified ones. DPR 2 and 1.5 add no new behavioral differences.
