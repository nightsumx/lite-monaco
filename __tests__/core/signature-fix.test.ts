// R3 修复回归:签名提示按用户实际键入的字符触发(自动闭合 / 包裹 / 过键),触发字符照 Monaco TS 只有 ( 和 ,
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView, inputHandler } from '../../src/core/view/editorview'
import { closeBrackets } from '../../src/core/edit/closebrackets'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { signatureHelpSession, signatureTriggerChar } from '../../src/lang/tssignature'

const SLOW = 60_000
const DOC = 'function add(a: number, b: number) { return a + b }\nfunction g<T>(a: T): T { return a }\n'

function mountView(doc: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.single(doc.length), extensions: [closeBrackets()] }),
        parent: host,
    })
    return { view, done: () => { view.destroy(); host.remove() } }
}

// 照 domchange:逐字先问 inputHandler(自动闭合/过键/包裹),没人认领就普通插入
function type(view: EditorView, text: string) {
    for (const ch of text) {
        const { from, to } = view.state.selection.main
        if (view.state.facet(inputHandler).some(h => h(view, from, to, ch))) continue
        view.dispatch(view.state.update({ changes: { from, to, insert: ch }, selection: { anchor: from + 1 }, userEvent: 'input.type' }))
    }
}

async function until(pred: () => boolean, ms = 20_000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (pred()) return true
        await new Promise(r => setTimeout(r, 20))
    }
    return pred()
}

const sig = (v: EditorView) => v.dom.querySelector('.cm-signature-help') as HTMLElement | null

async function mount(name: string, doc = DOC) {
    clearTSServiceCache()
    const m = mountView(doc)
    const off = signatureHelpSession(m.view, { lang: 'typescript', fileName: name })
    await getTSService({ lang: 'typescript', fileName: name }).ensure()
    return { ...m, off }
}

describe('signatureTriggerChar 看用户键入的字符', () => {
    const st = (doc: string, anchor: number, head = anchor) =>
        EditorState.create({ doc, selection: EditorSelection.single(anchor, head), extensions: [closeBrackets()] })
    const typed = (state: EditorState, ch: string) => {
        let tr: import('../../src/core/model/state').Transaction | null = null
        const fake = { state, dispatch: (t: typeof tr) => { tr = t } } as unknown as EditorView
        const { from, to } = state.selection.main
        const handled = state.facet(inputHandler).some(h => h(fake, from, to, ch))
        return handled ? tr! : state.update({ changes: { from, to, insert: ch }, selection: { anchor: from + 1 }, userEvent: 'input.type' })
    }

    it('行尾 ( 被自动闭合成 () → 触发字符是 (', () => {
        const tr = typed(st('add', 3), '(')
        expect(tr.isUserEvent('input.type.autoclose')).toBe(true)
        expect(signatureTriggerChar(tr, false)).toBe('(')
    })

    it('选中内容打 ( 被包裹 → 触发字符是 (', () => {
        const tr = typed(st('add x', 4, 5), '(')
        expect(tr.isUserEvent('input.type.surround')).toBe(true)
        expect(signatureTriggerChar(tr, false)).toBe('(')
    })

    it('过键 ) 不算触发字符(Monaco TS 没有重触发字符,靠内容变化重问)', () => {
        const s0 = typed(st('add', 3), '(').apply()
        const tr = typed(s0, ')')
        expect(tr.newDoc.toString()).toBe('add()')
        expect(signatureTriggerChar(tr, true)).toBeNull()
        expect(signatureTriggerChar(tr, false)).toBeNull()
    })

    it('< 不是触发字符(Monaco TS signatureHelpTriggerCharacters 只有 ( ,)', () => {
        expect(signatureTriggerChar(typed(st('g', 1), '<'), false)).toBeNull()
        expect(signatureTriggerChar(typed(st('g', 1), '<'), true)).toBeNull()
        expect(signatureTriggerChar(typed(st('add(1', 5), ','), false)).toBe(',')
    })
})

describe('签名提示 + 自动闭合', () => {
    it('行尾打 add( 自动闭合成 add() 也弹签名;再打 ) 过键后关掉', async () => {
        const { view, done, off } = await mount('/sig-autoclose.ts')
        type(view, 'add(')
        expect(view.state.doc.toString().endsWith('add()')).toBe(true)
        expect(await until(() => !!sig(view), 5000)).toBe(true)
        expect(sig(view)!.querySelector('.cm-signature-param-active')?.textContent).toMatch(/^a/)
        type(view, '1, ')
        expect(await until(() => sig(view)?.querySelector('.cm-signature-param-active')?.textContent?.startsWith('b') === true, 5000)).toBe(true)
        type(view, '2)')
        expect(view.state.doc.toString().endsWith('add(1, 2)')).toBe(true)
        expect(await until(() => !sig(view), 5000)).toBe(true)
        off(); done()
    }, SLOW)

    it('选中 x 打 ( 包裹成 add(x):首次触发按 characterTyped 问 TS,光标前不是 ( → 不弹(同 Monaco)', async () => {
        const doc = DOC + 'add x'
        const { view, done, off } = await mount('/sig-surround.ts', doc)
        view.dispatch(view.state.update({ selection: EditorSelection.single(doc.length - 1, doc.length) }))
        type(view, '(')
        expect(view.state.doc.toString().endsWith('add (x)')).toBe(true)
        await new Promise(r => setTimeout(r, 400))
        expect(sig(view)).toBeNull()
        off(); done()
    }, SLOW)

    it('g< 不弹(泛型尖括号不是触发字符),g<number>( 弹', async () => {
        const { view, done, off } = await mount('/sig-generic.ts')
        type(view, 'g<')
        await new Promise(r => setTimeout(r, 400))
        expect(sig(view)).toBeNull()
        type(view, 'number>(')
        expect(await until(() => !!sig(view), 5000)).toBe(true)
        off(); done()
    }, SLOW)
})
