// Monaco 的 withTestCodeEditor 夹具 → 用 lite-monaco 真编辑器(jsdom)实现。
// 原版测试里 editor 是 ITestCodeEditor;这里 editor 就是 liteMonaco(),Monaco 方法由 src/api 提供。
import { createEditor } from '../../src/api/create'
import { createModel } from '../../src/api/model'
import { Position, Selection } from '../../src/api/position'
import { makeViewModel } from './_viewModel'
import { createModelServices, stubTokenization } from './testTextModel'
import { installTokenBridge } from './tokenizationBridge'
import { getContextKeyService } from '../../src/api/contextkeys'
import { makeInstantiationService } from './instantiation'
import { IInstantiationService } from './instantiation'
import { IContextKeyService } from './contextkey'
import { IStorageService, InMemoryStorageService } from './storage'
import { IClipboardService } from './clipboardService'
import { INotificationService, nullNotificationService } from './notification'
import { IHoverService } from './hover'
import { NullHoverService } from './nullHoverService'
import { TestClipboardService } from './testClipboardService'
import { TextBufferFactory } from './pieceTreeTextBufferBuilder'
import { ILabelService } from './label'
import { IWorkspaceContextService } from './workspace'
import { setSnippetServices } from '../../src/api/snippetsession'

// Monaco 的 getSelection(s) 返回 Selection 实例;lite-monaco 可能返回结构相同的普通对象。
// 原版测试用 deepStrictEqual 比原型,所以在夹具层统一成 Selection 实例(这是夹具问题,不算行为差异)。
const toSel = (x: any) => x instanceof Selection ? x : new Selection(x.selectionStartLineNumber, x.selectionStartColumn, x.positionLineNumber, x.positionColumn)
// Monaco 的编辑器服务(DI):serviceCollection 里给的优先,其余用默认替身。contextkey 服务就是 lite-monaco 自己的。
function makeServices(raw: any, collection?: { get(id: unknown): unknown }) {
    const defaults = new Map<unknown, unknown>([
        [IContextKeyService, getContextKeyService(raw)], [IStorageService, new InMemoryStorageService()],
        [IClipboardService, new TestClipboardService()], [INotificationService, nullNotificationService], [IHoverService, NullHoverService],
    ])
    const get = (id: unknown): unknown => id === IInstantiationService ? inst : collection?.get(id) ?? defaults.get(id)
    const accessor = { get, getIfExists: get }
    const inst: any = { ...makeInstantiationService(get), invokeFunction: (fn: (a: typeof accessor, ...r: unknown[]) => unknown, ...rest: unknown[]) => fn(accessor, ...rest), get }
    return inst
}
function wrap(ed: any, collection?: { get(id: unknown): unknown }) {
    const contributions = new Map<string, unknown>()
    const inst = makeServices(ed, collection)
    const proxy = new Proxy(ed, { get(t, k, r) {
        if (k === '__inst') return inst
        if (k === 'getContribution') return (id: string) => contributions.get(id) ?? null
        if (k === 'registerDisposable') return (d: { dispose(): void }) => { ed.onDestroy(() => d.dispose()); return d }
        if (k === 'invokeWithinContext') return (fn: (a: unknown) => unknown) => inst.invokeFunction(fn)
        if (k === 'runAction') return (action: any, args?: unknown) => inst.invokeFunction((a: unknown) => action.run(a, r, args))
        if (k === 'registerAndInstantiateContribution') return (id: string, C: new (...a: any[]) => unknown) => { const c = inst.createInstance(C, r); contributions.set(id, c); return c }
        if (k === 'getViewModel') return () => makeViewModel(r)
        if (k === 'getSelections') return () => { const v = t.getSelections(); return v && v.map(toSel) }
        if (k === 'runCommand') return (cmd: { id: string }, args?: unknown) => t.trigger('test', cmd.id, args)
        if (k === 'getPosition') return () => { const v = t.getPosition(); return v && (v instanceof Position ? v : new Position(v.lineNumber, v.column)) }
        if (k === 'getSelection') return () => { const v = t.getSelection(); return v && toSel(v) }
        const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v
    } })
    // 片段会话要的 label / workspace 服务:把夹具 serviceCollection 里的登记到 lite-monaco 的编辑器服务表(只是搬运)
    if (collection) setSnippetServices(proxy, { labelService: collection.get(ILabelService) as never, workspaceService: collection.get(IWorkspaceContextService) as never })
    return proxy
}

const fakeHighlighter = {
    codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['text', 'plaintext'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as never

// 只测编辑内核:关掉所有重功能,避免无关副作用
const QUIET = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, codeActions: false, stickyScroll: false }

// Monaco 夹具的 envConfig.outerWidth / outerHeight(编辑器外框尺寸)→ lite-monaco 公开的 dimension 选项(= layout(dimension))。只翻译,不放行为。
function withEnvDimension(options: Record<string, unknown>): Record<string, unknown> {
    const env = options.envConfig as { outerWidth?: number, outerHeight?: number } | undefined
    if (env?.outerHeight === undefined && env?.outerWidth === undefined) return options
    return { ...options, dimension: { width: env.outerWidth ?? 100, height: env.outerHeight ?? 100 } }
}

// jsdom 没有布局,量不到行高,heightMap 按 oracle 默认 14px 估;真浏览器里测得的行高 = lineHeight 选项(Monaco 默认 19)。
// 夹具给了外框尺寸(要用几何:scrollTop / 行顶)时,把「量到的行高」供给 oracle,与真页同口径。
function supplyMeasuredLineHeight(raw: any, options: Record<string, unknown>) {
    const env = options.envConfig as { outerHeight?: number } | undefined
    if (env?.outerHeight === undefined || !raw.oracle) return
    const lh = raw.fontInfo().lineHeight
    if (!lh || raw.oracle.lineHeight === lh) return
    raw.oracle.lineHeight = lh
    raw.resetHeights()
    raw.remeasure?.()
}

type Text = string | string[] | TextBufferFactory | { uri?: unknown }
const textOf = (t: Text): string => t instanceof TextBufferFactory ? t.text : Array.isArray(t) ? t.join('\n') : (t as string)

export function withTestCodeEditor(text: Text, options: Record<string, unknown>, callback: (editor: any, viewModel: any, inst: any) => void): void {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const isModel = typeof text === 'object' && !Array.isArray(text) && !(text instanceof TextBufferFactory) && (text as { uri?: unknown }).uri
    const { serviceCollection, ...opts } = options as { serviceCollection?: { get(id: unknown): unknown } }
    const model = stubTokenization(isModel ? (text as never) : createModel(textOf(text)))
    // Monaco 的夹具建 model 用 DEFAULT_CREATION_OPTIONS(不按内容探测缩进:tabSize 4 / insertSpaces true)
    if (!isModel) (model as { updateOptions(o: unknown): void }).updateOptions({ tabSize: 4, indentSize: 'tabSize', insertSpaces: true })
    const raw = createEditor(parent, { model: model as never, highlighter: fakeHighlighter, features: QUIET, autoIndent: 'full', ...opts } as never)
    installTokenBridge(raw) // Monaco TokenizationRegistry 里注册的 token 类型 → core 外部 token 来源
    const editor = wrap(raw, serviceCollection)
    // Monaco 测试里常把 editor 当 viewModel 用(getSelection / getSelections)
    try { callback(editor as never, makeViewModel(editor) as never, createModelServices() as never) } finally { editor.dispose(); parent.remove() }
}

export const withAsyncTestCodeEditor = async (text: Text, options: Record<string, unknown>, callback: (e: any, v: any, i: any) => Promise<void>) => {
    const parent = document.createElement('div'); document.body.appendChild(parent)
    // jsdom 的 rAF 靠内部 setInterval,runWithFakedTimers 拆假时钟后清不掉 → 队列清不空。异步夹具里换成 setTimeout 版
    const win = parent.ownerDocument.defaultView as unknown as Record<string, unknown>
    Object.defineProperty(win, 'requestAnimationFrame', { value: (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16), configurable: true, writable: true })
    Object.defineProperty(win, 'cancelAnimationFrame', { value: (h: number) => clearTimeout(h as never), configurable: true, writable: true })
    const { serviceCollection, ...opts } = withEnvDimension(options) as { serviceCollection?: { get(id: unknown): unknown } }
    const isModel = typeof text === 'object' && !Array.isArray(text) && !(text instanceof TextBufferFactory) && (text as { uri?: unknown }).uri
    const model = isModel ? text : createModel(textOf(text))
    const rawEditor = createEditor(parent, { model: model as never, highlighter: fakeHighlighter, features: QUIET, autoIndent: 'full', ...opts } as never)
    supplyMeasuredLineHeight(rawEditor, options)
    const editor = wrap(rawEditor, serviceCollection)
    try { await callback(editor as never, makeViewModel(editor) as never, editor.__inst as never) } finally { editor.dispose(); parent.remove() }
}

// —— 服务夹具(createCodeEditorServices / instantiateTestCodeEditor),服务实现见 testTextModel.ts ——
export const createCodeEditorServices = (disposables?: { add<T>(x: T): T }, serviceCollection?: { get(id: unknown): unknown, entries?(): Iterable<[unknown, unknown]> }) => createModelServices(disposables, serviceCollection)
export function instantiateTestCodeEditor(inst: unknown, model: unknown, options: Record<string, unknown> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const raw = createEditor(parent, { model: model as never, highlighter: fakeHighlighter, features: QUIET, autoIndent: 'full', ...options } as never)
    installTokenBridge(raw) // Monaco TokenizationRegistry 里注册的 token 类型 → core 外部 token 来源
    const editor = wrap(raw)
    const dispose = editor.dispose.bind(editor)
    // ICodeEditorService.listCodeEditors:同一套服务里建出来的编辑器登记在册
    const reg = (inst as { _editors?: unknown[] } | undefined)?._editors
    reg?.push(editor)
    editor.dispose = () => { dispose(); parent.remove(); if (reg) { const i = reg.indexOf(editor); if (i >= 0) reg.splice(i, 1) } }
    return editor as any
}

// Monaco createTestCodeEditor(model, options):直接给 model 起编辑器(serviceCollection 里的服务经 registerAndInstantiateContribution 注入)
export function createTestCodeEditor(model: unknown, options: Record<string, unknown> = {}) {
    const { serviceCollection, ...opts } = options as { serviceCollection?: { get(id: unknown): unknown } }
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const raw = createEditor(parent, { model: model as never, highlighter: fakeHighlighter, features: QUIET, autoIndent: 'full', lightbulb: { enabled: 'onCode' }, ...opts } as never)
    installTokenBridge(raw)
    const editor = wrap(raw, serviceCollection)
    const dispose = editor.dispose.bind(editor)
    editor.dispose = () => { dispose(); parent.remove() }
    return editor as any
}
