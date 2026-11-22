// 移动块的 Compare 对齐视图(Monaco movedTextToCompare):点 caption 上的 Compare →
//  1. 只画这个块里面的改动,其它 diff 着色全部消失;
//  2. 块里面的改动按行内文字对齐,块两侧起点靠顶部空白对齐;挨着块的普通对齐不再画;
//  3. 回退箭头不画;comparingMovedCode context key 置位;
//  4. 重算 diff 后按 modified 区间相交认回来;光标移出块 / Esc / 再点一次 / setModel 都退出。
// 期望来自 Monaco diffEditorDecorations / diffEditorViewZones / diffEditorViewModel 源码。
import { afterEach, describe, expect, it } from 'vitest'
import { createDiffEditor, type DiffEditorConstructionOptions } from '../../src/diffeditor'
import { getContextKeyService } from '../../src/api/contextkeys'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

type D = ReturnType<typeof createDiffEditor>
const live: (() => void)[] = []
afterEach(() => { while (live.length) live.pop()!() })
function mount(a: string, b: string, extra: Partial<DiffEditorConstructionOptions> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original: a, modified: b, experimental: { showMoves: true }, recomputeDebounceMs: 0, ...extra })
    live.push(() => { d.destroy(); parent.remove() })
    return d
}
const tick = () => new Promise(r => setTimeout(r, 30))

const fn = (i: number) => `function number${i}() { return ${i} }`
const fns = Array.from({ length: 14 }, (_, i) => fn(i))
// original:0..13;modified:把前 6 个挪到末尾,并且挪过去的块里把 number2 改成 number2b
const orig = fns.join('\n')
const movedPart = fns.slice(0, 6).map((l, i) => i === 2 ? l.replace('number2', 'number2b') : l)
const mod = [...fns.slice(6), ...movedPart].join('\n')

const compareLink = (d: D) => d.dom.querySelector('.diff-moved-code-block a[title="Compare"]') as HTMLElement
const lineClasses = (d: D, side: 'getOriginalEditor' | 'getModifiedEditor', cls: string) => d.dom.querySelectorAll(`.${side === 'getOriginalEditor' ? 'editor.original' : 'editor.modified'} .${cls}`).length
const priv = (d: D) => d as unknown as { compareMove: unknown, zones: [{ afterLine: number, height: number }[], { afterLine: number, height: number }[]], topPad: [number, number], moves: { originalStart: number, originalEnd: number, modifiedStart: number, modifiedEnd: number, changes: unknown[] }[] }

describe('Compare 视图:进入 / 退出', () => {
    it('夹具:算出一个移动块,块里有一处小改动', () => {
        const d = mount(orig, mod)
        const mv = priv(d).moves
        expect(mv.length).toBe(1)
        expect(mv[0]).toMatchObject({ originalStart: 1, originalEnd: 7, modifiedStart: 9, modifiedEnd: 15 })
        expect(mv[0].changes.length).toBeGreaterThan(0)
    })
    it('点 Compare:链接 checked + aria-pressed,再点一次退出', () => {
        const d = mount(orig, mod)
        expect(compareLink(d).getAttribute('aria-pressed')).toBe('false')
        compareLink(d).click()
        expect(compareLink(d).getAttribute('aria-pressed')).toBe('true')
        expect(compareLink(d).classList.contains('checked')).toBe(true)
        expect(priv(d).compareMove).toBeTruthy()
        compareLink(d).click()
        expect(priv(d).compareMove).toBeUndefined()
        expect(compareLink(d).getAttribute('aria-pressed')).toBe('false')
    })
    it('Esc / diffEditor.exitCompareMove 退出', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        d.runAction('diffEditor.exitCompareMove')
        expect(priv(d).compareMove).toBeUndefined()
        compareLink(d).click()
        const mv = d.getModifiedEditor()
        mv.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        expect(priv(d).compareMove).toBeUndefined()
    })
    it('光标移出这个块(落到别的位置)→ 退出', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        const o = d.getOriginalEditor()
        // original 的第 10 行不在移动块里
        o.dispatch(o.state.update({ selection: { anchor: o.state.doc.line(10).from } }))
        expect(priv(d).compareMove).toBeUndefined()
    })
    it('光标留在块里:仍在 Compare', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        const m = d.getModifiedEditor()
        m.dispatch(m.state.update({ selection: { anchor: m.state.doc.line(11).from } }))
        expect(priv(d).compareMove).toBeTruthy()
    })
    it('setModel 换文本 → 退出且空白清零', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        d.setModel({ original: 'a\nb', modified: 'a\nc' })
        expect(priv(d).compareMove).toBeUndefined()
        expect(priv(d).topPad).toEqual([0, 0])
    })
    it('comparingMovedCode context key:进入 true,退出 false(两侧都有)', () => {
        const d = mount(orig, mod)
        const keys = [d.getOriginalEditor(), d.getModifiedEditor()].map(v => getContextKeyService(v))
        expect(keys.map(k => !!k.getValue('comparingMovedCode'))).toEqual([false, false])
        compareLink(d).click()
        expect(keys.map(k => k.getValue('comparingMovedCode'))).toEqual([true, true])
        d.exitCompareMove()
        expect(keys.map(k => !!k.getValue('comparingMovedCode'))).toEqual([false, false])
    })
})

describe('Compare 视图:装饰', () => {
    it('普通视图:整行着色 + 移动块;Compare 视图:只剩块里的改动着色', () => {
        const d = mount(orig, mod)
        const normalDel = lineClasses(d, 'getOriginalEditor', 'line-delete')
        expect(normalDel).toBeGreaterThan(0)
        compareLink(d).click()
        // 块里只有 number2 → number2b 一处改动:original 一行、modified 一行
        expect(lineClasses(d, 'getOriginalEditor', 'line-delete')).toBe(1)
        expect(lineClasses(d, 'getModifiedEditor', 'line-insert')).toBe(1)
        // number2 → number2b 只是在 modified 侧多了一个字符:original 侧是空范围,不画 char-delete
        expect(lineClasses(d, 'getOriginalEditor', 'char-delete')).toBe(0)
        expect(lineClasses(d, 'getModifiedEditor', 'char-insert')).toBeGreaterThan(0)
        // 移动块框仍在,且是当前块
        expect(lineClasses(d, 'getModifiedEditor', 'currentMove')).toBeGreaterThan(0)
        expect(lineClasses(d, 'getOriginalEditor', 'currentMove')).toBeGreaterThan(0)
        d.exitCompareMove()
        expect(lineClasses(d, 'getOriginalEditor', 'line-delete')).toBe(normalDel)
    })
    it('着色落在块里被改的那一行(modified 第 11 行 = number2b)', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        const m = d.getModifiedEditor()
        const lines = [...m.contentDOM.querySelectorAll('.cm-line')]
        const hit = lines.filter(l => l.classList.contains('line-insert'))
        expect(hit.length).toBe(1)
        expect(hit[0].textContent).toContain('number2b')
        const o = [...d.getOriginalEditor().contentDOM.querySelectorAll('.cm-line.line-delete')]
        expect(o.length).toBe(1)
        expect(o[0].textContent).toContain('number2()')
    })
    it('Compare 视图里不画回退箭头;退出后回来', () => {
        const d = mount(orig, mod, { renderGutterMenu: false })
        const arrows = () => d.dom.querySelectorAll('.arrow-revert-change').length
        const before = arrows()
        expect(before).toBeGreaterThan(0)
        compareLink(d).click()
        expect(arrows()).toBe(0)
        d.exitCompareMove()
        expect(arrows()).toBe(before)
    })
})

describe('Compare 视图:对齐', () => {
    it('块两侧起点靠顶部空白对齐:靠下的一侧不垫,靠上的一侧垫差值', () => {
        const d = mount(orig, mod)
        const p = priv(d)
        expect(p.topPad).toEqual([0, 0])
        compareLink(d).click()
        // 块在 original 的 1..6 行(靠上),在 modified 的 9..14 行(靠下)→ original 侧垫空白
        expect(p.topPad[0]).toBeGreaterThan(0)
        expect(p.topPad[1]).toBe(0)
        const lh = d.getModifiedEditor().oracle.lineHeight
        expect(p.topPad[0]).toBeGreaterThanOrEqual(lh * 8 - 1)
        // 空白是 afterLine 0 的 view zone
        expect(p.zones[0].some(z => z.afterLine === 0 && z.height === p.topPad[0])).toBe(true)
    })
    it('退出后顶部空白清零', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        d.exitCompareMove()
        expect(priv(d).topPad).toEqual([0, 0])
        expect(priv(d).zones[0].some(z => z.afterLine === 0)).toBe(false)
    })
    it('块在 original 靠下时,垫的是 modified 侧(方向相反)', () => {
        // original:块在末尾;modified:块在开头
        const d = mount(mod, orig)
        const p = priv(d)
        expect(p.moves.length).toBe(1)
        compareLink(d).click()
        expect(p.topPad[1]).toBeGreaterThan(0)
        expect(p.topPad[0]).toBe(0)
    })
    it('块里的行内对齐保留:改动行两侧高度相同时没有多余的对齐空白', () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        const p = priv(d)
        // 块内唯一的改动是 1 行换 1 行,不需要对齐空白(顶部空白、块外的对齐不算):original 块 1..6,modified 块 9..14
        expect(p.zones[0].filter(z => z.afterLine >= 1 && z.afterLine <= 6).length).toBe(0)
        expect(p.zones[1].filter(z => z.afterLine >= 9 && z.afterLine <= 14).length).toBe(0)
    })
    it('块里的一行换成两行:块内出现对齐空白;挨着块的普通对齐被丢掉', () => {
        const m2 = mod.replace('number2b() { return 2 }', 'number2b() {\n  return 2\n}')
        const d = mount(orig, m2)
        const p = priv(d)
        compareLink(d).click()
        // original 的 number2 一行 ↔ modified 三行:original 侧在第 3 行(afterLine 3)补两行高的空白
        const lh = d.getModifiedEditor().oracle.lineHeight
        expect(p.zones[0].some(z => z.afterLine === 3 && Math.abs(z.height - 2 * lh) < 1)).toBe(true)
    })
})

describe('Compare 视图:重算 diff 后', () => {
    it('编辑块外的文本 → 块被重新认出(modified 区间相交),仍在 Compare', async () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        const m = d.getModifiedEditor()
        // 在 modified 第 1 行前插一行:块整体下移一行
        m.dispatch(m.state.update({ changes: { from: 0, insert: 'extra\n' } }))
        await tick()
        expect(priv(d).moves.length).toBe(1)
        expect(priv(d).compareMove).toBe(priv(d).moves[0])
        expect(priv(d).moves[0].modifiedStart).toBe(10)
    })
    it('编辑把整个块删了 → 退出 Compare', async () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        const m = d.getModifiedEditor()
        const from = m.state.doc.line(9).from
        m.dispatch(m.state.update({ changes: { from, to: m.state.doc.length, insert: '' } }))
        await tick()
        expect(priv(d).compareMove).toBeUndefined()
    })
    it('关掉 showMoves → 退出 Compare', async () => {
        const d = mount(orig, mod)
        compareLink(d).click()
        d.updateOptions({ experimental: { showMoves: false } })
        await tick()
        expect(priv(d).compareMove).toBeUndefined()
        expect(priv(d).topPad).toEqual([0, 0])
    })
})
