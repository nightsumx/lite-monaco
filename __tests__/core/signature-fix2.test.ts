// 第 2 轮:签名帮助对齐 Monaco parameterHintsWidget —— 参数文档 + 函数文档都出(markdown)、多重载左栏按钮、
// 窗口内定位(卡底贴行顶、可伸出编辑器)、触发防抖 120ms
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { placeSignatureHelp, renderSignatureHelp, signatureHelpSession, type SignatureHelpModel } from '../../src/lang/tssignature'

const SLOW = 60_000
const text = (t: string) => [{ text: t, kind: 'text' }]

describe('renderSignatureHelp 文档', () => {
    const model: SignatureHelpModel = {
        signatures: [{
            label: 'add(a: number, b: number): number',
            parts: [],
            params: [
                { label: 'a: number', parts: [], documentation: text('- the **first**') },
                { label: 'b: number', parts: [] },
            ],
            documentation: text('Adds two numbers with `code`.'),
        }],
        activeSignature: 0,
        activeParameter: 0,
    }

    it('参数文档在前、函数文档在后,都按 markdown 渲染', () => {
        const el = renderSignatureHelp(model)
        const docs = el.querySelector('.cm-signature-doc')!
        const mds = docs.querySelectorAll('.cm-md')
        expect(mds).toHaveLength(2)
        expect(mds[0].querySelector('li')?.textContent).toBe('the first')
        expect(mds[0].querySelector('strong')?.textContent).toBe('first')
        expect(mds[1].querySelector('code')?.textContent).toBe('code')
        expect(docs.textContent).toBe('the firstAdds two numbers with code.')
    })

    it('当前参数没有文档 → 只有函数文档;两者都空 → 没有文档区', () => {
        const el = renderSignatureHelp({ ...model, activeParameter: 1 })
        expect(el.querySelectorAll('.cm-signature-doc .cm-md')).toHaveLength(1)
        const none = renderSignatureHelp({ ...model, signatures: [{ ...model.signatures[0], documentation: [] }], activeParameter: 1 })
        expect(none.querySelector('.cm-signature-doc')).toBeNull()
    })
})

describe('renderSignatureHelp 多重载控件(Monaco .phwrapper > .controls)', () => {
    const sigs = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `f${i}()`, parts: [], params: [] }))

    it('左栏:上一个、计数、下一个;计数按总数位数补零', () => {
        const el = renderSignatureHelp({ signatures: sigs(4), activeSignature: 0, activeParameter: 0 })
        expect(el.classList.contains('cm-signature-multiple')).toBe(true)
        const controls = el.querySelector('.cm-signature-wrapper > .cm-signature-controls')!
        expect([...controls.children].map(c => c.className)).toEqual([
            'cm-signature-button cm-signature-prev',
            'cm-signature-meta',
            'cm-signature-button cm-signature-next',
        ])
        expect(controls.querySelector('.cm-signature-meta')!.textContent).toBe('1/4')
        expect(controls.nextElementSibling?.className).toBe('cm-signature-body')
        const many = renderSignatureHelp({ signatures: sigs(12), activeSignature: 2, activeParameter: 0 })
        expect(many.querySelector('.cm-signature-meta')!.textContent).toBe('03/12')
    })

    it('单个签名没有控件列', () => {
        const el = renderSignatureHelp({ signatures: sigs(1), activeSignature: 0, activeParameter: 0 })
        expect(el.classList.contains('cm-signature-multiple')).toBe(false)
        expect(el.querySelector('.cm-signature-controls')).toBeNull()
    })
})

describe('placeSignatureHelp(Monaco _layoutBoxInPage,ABOVE 优先)', () => {
    const win = { width: 1200, height: 800 }
    const editor = { left: 100, top: 100, width: 600, height: 400 }

    it('上方放得下:卡底 = 行顶', () => {
        expect(placeSignatureHelp({ left: 300, top: 282, bottom: 302 }, { w: 270, h: 94 }, editor, win)).toEqual({ left: 300, top: 188 })
    })

    it('上方离窗口顶不到 22px → 下方:卡顶 = 行底', () => {
        expect(placeSignatureHelp({ left: 300, top: 100, bottom: 120 }, { w: 270, h: 94 }, editor, win)).toEqual({ left: 300, top: 120 })
    })

    it('上方超出编辑器但在窗口里 → 仍在上方(伸出编辑器上沿)', () => {
        expect(placeSignatureHelp({ left: 300, top: 120, bottom: 140 }, { w: 270, h: 94 }, editor, win).top).toBe(26)
    })

    it('上下都放不下 → 上方', () => {
        expect(placeSignatureHelp({ left: 300, top: 50, bottom: 70 }, { w: 270, h: 760 }, editor, { width: 1200, height: 800 }).top).toBe(-710)
    })

    it('水平:可伸出编辑器右缘,只夹在窗口里(左右各留 15px)', () => {
        expect(placeSignatureHelp({ left: 650, top: 282, bottom: 302 }, { w: 270, h: 94 }, editor, win).left).toBe(650)
        expect(placeSignatureHelp({ left: 1100, top: 282, bottom: 302 }, { w: 270, h: 94 }, { ...editor, width: 1000 }, win).left).toBe(1200 - 15 - 270)
        // 最多伸出编辑器右缘一个卡宽
        expect(placeSignatureHelp({ left: 1100, top: 282, bottom: 302 }, { w: 270, h: 94 }, editor, win).left).toBe(700)
        expect(placeSignatureHelp({ left: 5, top: 282, bottom: 302 }, { w: 270, h: 94 }, { ...editor, left: 0 }, win).left).toBe(15)
    })
})

function mountView(doc: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: EditorSelection.single(doc.length) }),
        parent: host,
    })
    return { view, done: () => { view.destroy(); host.remove() } }
}
const type = (v: EditorView, s: string) => {
    for (const ch of s) {
        const at = v.state.selection.main.head
        v.dispatch(v.state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: 'input.type' }))
    }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
async function until(pred: () => boolean, ms = 5000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (pred()) return true
        await sleep(10)
    }
    return pred()
}
const sig = (v: EditorView) => v.dom.querySelector('.cm-signature-help') as HTMLElement | null
const DOC = 'function add(a: number, b: number) { return a + b }\n'
    + 'function over(x: string): void\nfunction over(x: number, y: number): void\nfunction over(x: any, y?: any) {}\n'

async function mount(name: string) {
    clearTSServiceCache()
    const m = mountView(DOC)
    const off = signatureHelpSession(m.view, { lang: 'typescript', fileName: name })
    await getTSService({ lang: 'typescript', fileName: name }).ensure()
    return { ...m, off }
}

describe('signatureHelpSession', () => {
    it('打触发字符后 120ms 才问(Monaco ParameterHintsModel.DEFAULT_DELAY)', async () => {
        const { view, done, off } = await mount('/sig2-delay.ts')
        type(view, 'add(')
        await sleep(70)
        expect(sig(view)).toBeNull()
        expect(await until(() => !!sig(view))).toBe(true)
        off(); done()
    }, SLOW)

    it('点上一个 / 下一个按钮切重载(循环),焦点不离开编辑器', async () => {
        const { view, done, off } = await mount('/sig2-click.ts')
        type(view, 'over(')
        expect(await until(() => !!sig(view)?.querySelector('.cm-signature-meta'))).toBe(true)
        const meta = () => sig(view)!.querySelector('.cm-signature-meta')!.textContent
        expect(meta()).toBe('1/2')
        const click = (cls: string) => {
            const b = sig(view)!.querySelector(cls)!
            const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
            b.dispatchEvent(down)
            expect(down.defaultPrevented).toBe(true)
            b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        }
        click('.cm-signature-next')
        expect(meta()).toBe('2/2')
        click('.cm-signature-next')
        expect(meta()).toBe('1/2')
        click('.cm-signature-prev')
        expect(meta()).toBe('2/2')
        off(); done()
    }, SLOW)
})
