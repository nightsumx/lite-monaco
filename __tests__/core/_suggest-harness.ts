// 补全测试的共用夹具:挂一个真 liteMonaco(),经 SuggestUi / SuggestController 读写补全状态。
// 旧引擎的 completionField / completionSources 已删;测试走「真实路径」:provider 注册表 → SuggestModel → SuggestUi。
import { liteMonaco } from '../../src/litemonaco'
import type { LiteMonacoEditor } from '../../src/api/types'
import { suggestUi, type SuggestUi } from '../../src/core/feature/suggestwidget'
import { SuggestController } from '../../src/lang/suggestcontroller'
import { registerCompletionItemProvider, type CompletionItemProvider, type IDisposable } from '../../src/lang/providers'
import type { ScopedShiki } from '../../src/core/view/tokens'

export const fakeHl = () => ({
    codeToTokens: (code: string) => ({ tokens: [[{ content: code }]] }),
    getLastGrammarState: () => ({ getScopes: () => undefined }),
    getLoadedLanguages: () => ['json', 'text', 'typescript', 'javascript'],
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ScopedShiki

export const QUIET = { minimap: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

export const wait = (ms = 30) => new Promise<void>(r => setTimeout(r, ms))
export const until = async (fn: () => boolean, ms = 3000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(10) }

const cleanups: (() => void)[] = []
/** afterEach 里调:卸掉本文件挂的编辑器 / provider / 宿主节点 */
export function cleanupSuggest(): void { while (cleanups.length) cleanups.pop()!() }

export interface SuggestRig {
    v: LiteMonacoEditor
    ui: SuggestUi
    ctl: SuggestController
    host: HTMLElement
    /** 控件现在开着(含 Loading / No suggestions 提示行) */
    readonly open: boolean
    /** 控件开着且有列表 */
    readonly listed: boolean
    readonly labels: string[]
    readonly selected: number
    readonly doc: string
    /** 把光标放到偏移 pos(单选区) */
    at(pos: number): void
    /** 显式触发(⌃Space = editor.action.triggerSuggest) */
    trigger(): void
    /** 像用户一样打字(trigger('keyboard','type')),触发 quick suggest */
    type(text: string): void
    /** 等控件打开 / 关闭 */
    waitOpen(ms?: number): Promise<void>
    waitClosed(ms?: number): Promise<void>
}

export interface RigOptions {
    doc?: string
    lang?: string
    features?: Record<string, unknown>
    options?: Record<string, unknown>
    /** 在 plaintext 等语言上注册的 provider:[selector, provider] */
    providers?: [string, CompletionItemProvider][]
    /** 光标起始偏移(默认文末) */
    cursor?: number
    /** 宿主给的文件名(TS 项目里的文件) */
    fileName?: string
    /** 宿主 TS 文件(path → 内容) */
    tsFiles?: Record<string, string>
    /** 真 shiki(要 token 类型的用例:注释 / 字符串里不弹);缺省 fakeHl(无 token) */
    highlighter?: unknown
}

export function mountSuggest(o: RigOptions = {}): SuggestRig {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const regs: IDisposable[] = (o.providers ?? []).map(([sel, p]) => registerCompletionItemProvider(sel, p))
    const v = liteMonaco({
        parent: host, doc: o.doc ?? '', lang: o.lang ?? 'plaintext', highlighter: (o.highlighter ?? fakeHl()) as never,
        features: { ...QUIET, ...o.features } as never, options: o.options as never,
        ...(o.fileName ? { fileName: o.fileName } : {}), ...(o.tsFiles ? { tsFiles: o.tsFiles } : {}),
    })
    cleanups.push(() => { for (const r of regs) r.dispose(); try { v.dispose() } catch { /* */ } host.remove() })
    const ui = suggestUi(v)
    const ctl = SuggestController.get(v)!
    const pos = o.cursor ?? (o.doc ?? '').length
    v.dispatch(v.state.update({ selection: { anchor: pos } }))
    v.focus()
    const rig: SuggestRig = {
        v, ui, ctl, host,
        get open() { return ui.state.open },
        get listed() { return ui.state.open && !ui.state.message },
        get labels() { return ui.state.open && ui.host ? Array.from({ length: ui.state.count }, (_, i) => ui.host!.rowAt(i).label) : [] },
        get selected() { return ui.state.selected },
        get doc() { return v.state.sliceDoc() },
        at(p) { v.dispatch(v.state.update({ selection: { anchor: p } })) },
        trigger() { v.trigger('keyboard', 'editor.action.triggerSuggest', {}) },
        type(text) { v.trigger('keyboard', 'type', { text }) },
        waitOpen: (ms = 3000) => until(() => ui.state.open, ms),
        waitClosed: (ms = 3000) => until(() => !ui.state.open, ms),
    }
    return rig
}

// ───── 直接问 TS 补全 provider(不挂编辑器):旧 tsCompletionSource(state, {pos, explicit}) 的等价物 ─────
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { providerModel, type CompletionItemM } from '../../src/lang/providers'
import { tsCompletionProvider } from '../../src/lang/suggestproviders'
import type { TSServiceOptions } from '../../src/lang/tsservice'

/** 在 doc 的 pos(默认文末)处向 TS provider 要补全;explicit = 显式触发(⌃Space) */
export async function provideTs(doc: string, ts: TSServiceOptions, o: { pos?: number, explicit?: boolean, triggerKind?: number } = {}): Promise<CompletionItemM[] | null> {
    const pos = o.pos ?? doc.length
    const state = EditorState.create({ doc, selection: EditorSelection.single(pos) })
    const provider = tsCompletionProvider({ ts: () => ts, render: () => ({}), getState: () => state, isExplicit: () => !!o.explicit })
    const model = providerModel(() => state, ts.lang, 'inmemory://model/1')
    const res = await provider.provideCompletionItems(model, model.getPositionAt(pos), { triggerKind: o.triggerKind ?? 0 } as never, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { /* */ } }) } as never)
    return res ? res.suggestions : null
}

/** 固定候选的 provider:每项 insertText = label,range = 光标前的词(Monaco 协议要求 range) */
export function fixedProvider(labels: string[], extra: Partial<import('../../src/lang/providers').CompletionItemM> = {}): CompletionItemProvider {
    return {
        provideCompletionItems(model, position) {
            const w = model.getWordUntilPosition(position)
            const range = { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column }
            return { suggestions: labels.map(label => ({ label, kind: 4, insertText: label, range, ...extra })) }
        },
    }
}

/** 一组 Partial 候选(label 必填;insertText 缺省 = label;kind 缺省 Variable;range = 光标前的词) */
export function itemsProvider(items: (Partial<import('../../src/lang/providers').CompletionItemM> & { label: string })[]): CompletionItemProvider {
    return {
        provideCompletionItems(model, position) {
            const w = model.getWordUntilPosition(position)
            const range = { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column }
            return { suggestions: items.map(it => ({ kind: 4, insertText: it.label, range, ...it })) }
        },
    }
}

/** `a|b` 形式的文本:| 标光标 */
export function splitCaret(text: string): { doc: string, cursor: number } {
    const caret = text.indexOf('|')
    return caret < 0 ? { doc: text, cursor: 0 } : { doc: text.slice(0, caret) + text.slice(caret + 1), cursor: caret }
}
