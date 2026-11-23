// lite-monaco/react 对 @monaco-editor/react 4.7.0 的类型层平替(对照是 fixtures 里原样拷贝的官方 d.ts)。
// tsc 编译即断言(tsconfig 包含 __tests__;react-compat.test.ts 在 vitest 里再编译一次)。
// 行为层的对比在浏览器里:scripts/browser-diff/react/run.mjs。
import type * as R from './fixtures/monaco-editor-react-4.7.0/index'
import type * as LR from '../../src/react/index'
import type * as M from 'monaco-editor'
import type * as L from '../../src/index'

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

// ── 1. 出口:值同名、类型同名 ──
export const valueNames: Eq<keyof typeof R, keyof typeof LR> = true
export type TypeNames = [LR.BeforeMount, LR.DiffBeforeMount, LR.DiffEditorProps, LR.DiffOnMount, LR.EditorProps, LR.Monaco, LR.MonacoDiffEditor,
    LR.OnChange, LR.OnMount, LR.OnValidate, LR.Theme]

// ── 2. props:键一样;照官方类型写的 props 原样交给我们,我们的 props 也能当官方的用 ──
export const editorKeys: Eq<keyof R.EditorProps, keyof LR.EditorProps> = true
export const diffKeys: Eq<keyof R.DiffEditorProps, keyof LR.DiffEditorProps> = true
export const inEditor = (p: R.EditorProps): LR.EditorProps => p
export const inDiff = (p: R.DiffEditorProps): LR.DiffEditorProps => p
// 反过来只比非回调的 props:我们的 onMount / beforeMount 给的是更宽的类型(LiteMonacoEditor、整个 lite monaco),
// 照我们的类型写的回调会用到官方没有的成员,交给官方本来就不该通过
type Callbacks = 'onMount' | 'beforeMount' | 'onChange' | 'onValidate'
export const outEditor = (p: Omit<LR.EditorProps, Callbacks>): Omit<R.EditorProps, Callbacks> => p
export const outDiff = (p: Omit<LR.DiffEditorProps, 'onMount' | 'beforeMount'>): Omit<R.DiffEditorProps, 'onMount' | 'beforeMount'> => p
export const theme: Eq<R.Theme, LR.Theme> = true

// ── 3. 组件、hook、loader 能顶替官方的(换 import 不改别的代码) ──
export const editorDefault: typeof R.default = null! as typeof LR.default
export const editorNamed: typeof R.Editor = null! as typeof LR.Editor
export const diffEditor: typeof R.DiffEditor = null! as typeof LR.DiffEditor
export const loader: typeof R.loader = null! as typeof LR.loader

// ── 4. 交给回调的 monaco:lite 整个 monaco 当官方的用,除了下面明确没有的 ──
// 没有的(理由见 MIGRATION.md「没有的」):
//   createWebWorker / editor.createWebWorker:Monaco 的 worker 协议(worker 一侧要用 monaco-editor 自己的 editor.worker)
//   lsp:monaco-lsp-client(WebSocket / Worker 上的 LSP 客户端)
//   editor.createMultiFileDiffEditor:官方返回 any,没有公开的形状
//   typescript.getTypeScriptWorker / getJavaScriptWorker / typescriptVersion:TS 项目按编辑器收文件,不按 model 的 uri
type MissingTop = 'createWebWorker' | 'lsp'
type MissingEditor = 'createWebWorker' | 'createMultiFileDiffEditor'
type MissingTypescript = 'getTypeScriptWorker' | 'getJavaScriptWorker' | 'typescriptVersion'
export const missingTop: Eq<Exclude<keyof typeof M, keyof typeof L>, MissingTop> = true
export const missingEditor: Eq<Exclude<keyof typeof M.editor, keyof typeof L.editor>, MissingEditor> = true
export const missingTypescript: Eq<Exclude<keyof typeof M.typescript, keyof typeof L.typescript>, MissingTypescript> = true
export const missingLanguages: Eq<Exclude<keyof typeof M.languages, keyof typeof L.languages>, never> = true
export const missingCss: Eq<Exclude<keyof typeof M.css, keyof typeof L.css>, never> = true
export const missingHtml: Eq<Exclude<keyof typeof M.html, keyof typeof L.html>, never> = true
export const missingJson: Eq<Exclude<keyof typeof M.json, keyof typeof L.json>, never> = true

// 这几个类在 monaco.d.ts 里声明成无参构造(真实构造参数是内部的),lite 的构造函数照实写了参数,new 签名对不上;
// 用户不会自己 new 它们(都是编辑器给出来的),所以只比静态成员和实例(prototype)
type Ctor = 'TextModelResolvedOptions' | 'FindMatch' | 'ConfigurationChangedEvent' | 'FontInfo' | 'BareFontInfo'
type Statics<C> = { [K in keyof C]: C[K] }
// languages.css / html / json / typescript:0.55 的 d.ts 写成 { deprecated: true } 占位,运行时却挂着和顶层同一个对象
// (editor.main.js:monacoApi.languages.css = …);lite 照运行时做,所以这四个不比 d.ts 的占位
type LangPlaceholders = 'css' | 'html' | 'json' | 'typescript'
type Official = Omit<typeof M, MissingTop | 'editor' | 'typescript' | 'Uri' | 'languages'> & {
    Uri: Statics<typeof M.Uri>
    languages: Omit<typeof M.languages, LangPlaceholders>
    editor: Omit<typeof M.editor, MissingEditor | Ctor> & { [K in Ctor]: Statics<typeof M.editor[K]> }
    typescript: Omit<typeof M.typescript, MissingTypescript>
}
export const monacoAsOfficial = (m: typeof L): Official => m
export const useMonacoAsOfficial = (m: ReturnType<typeof LR.useMonaco>): Official | null => m
