// 最终补测:Diff 编辑器的八条 jsdom 能测的部分。jsdom 没有布局,几何用桩:
//   · .cm-scroller 的 clientHeight = 400(paintFills / paintOverview 在高度为 0 时直接清空)
//   · 根节点 clientHeight = 400、clientWidth = 800
//   · scrollTop 用可写的自有属性(jsdom 里是常量 0),设了就派发 scroll
// 桩不了的:真实的像素位置(getBoundingClientRect 全 0,所以 left/top 里的 dx/dy = 0,只能断言 zone 的"相对位置"和"高度"),
// 字级框 .char-insert / .char-delete 的 x 范围,斜纹的 CSS 渐变本身长什么样(需要真浏览器)。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDiffEditor, type DiffEditor, type DiffEditorConstructionOptions } from '../../src/diffeditor'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

const H = 400
const restores: (() => void)[] = []
beforeEach(() => {
    const P = HTMLElement.prototype
    const prev = { h: Object.getOwnPropertyDescriptor(P, 'clientHeight'), w: Object.getOwnPropertyDescriptor(P, 'clientWidth') }
    Object.defineProperty(P, 'clientHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cm-scroller') || this.classList.contains('monaco-diff-editor') || this.classList.contains('lc-diff') ? H : 0 } })
    Object.defineProperty(P, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.classList.contains('cm-scroller') ? 400 : this.parentElement === document.body ? 800 : 0 } })
    restores.push(() => {
        if (prev.h) Object.defineProperty(P, 'clientHeight', prev.h); else delete (P as unknown as Record<string, unknown>).clientHeight
        if (prev.w) Object.defineProperty(P, 'clientWidth', prev.w); else delete (P as unknown as Record<string, unknown>).clientWidth
    })
})
const live: { d: DiffEditor, parent: HTMLElement }[] = []
afterEach(() => {
    for (const { d, parent } of live.splice(0)) { d.destroy(); parent.remove() }
    while (restores.length) restores.pop()!()
    document.body.innerHTML = ''
})

function scrollable(sd: HTMLElement, height: number) {
    let top = 0
    Object.defineProperty(sd, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = Math.max(0, Math.min(v, height)) } })
    Object.defineProperty(sd, 'scrollHeight', { configurable: true, get: () => height + H })
}

function mount(original: string, modified: string, extra: Partial<DiffEditorConstructionOptions> = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original, modified, recomputeDebounceMs: 0, ...extra })
    live.push({ d, parent })
    d.layout()
    return d
}

const lineClasses = (v: { contentDOM: HTMLElement }, cls: string) =>
    [...v.contentDOM.querySelectorAll('.cm-line')].flatMap((el, i) => el.classList.contains(cls) ? [i + 1] : [])

describe('Diff:line-insert / line-delete 底色类', () => {
    it('纯插入:modified 侧被插入的行带 line-insert + char-insert(整行都是新的),original 侧没有 line-delete', () => {
        const d = mount('a\nb\nc\n', 'a\nX\nY\nb\nc\n')
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([2, 3])
        expect(lineClasses(d.getModifiedEditor(), 'char-insert')).toEqual([2, 3])
        expect(lineClasses(d.getOriginalEditor(), 'line-delete')).toEqual([])
    })
    it('纯删除:original 侧被删的行带 line-delete + char-delete,modified 侧没有 line-insert', () => {
        const d = mount('a\nX\nY\nb\n', 'a\nb\n')
        expect(lineClasses(d.getOriginalEditor(), 'line-delete')).toEqual([2, 3])
        expect(lineClasses(d.getOriginalEditor(), 'char-delete')).toEqual([2, 3])
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([])
    })
    it('修改:两侧都有各自的行底色,但整行底色之外没有 char-* 行类(字级框是 span 上的)', () => {
        const d = mount('a\nhello world\nc\n', 'a\nhello there\nc\n')
        expect(lineClasses(d.getOriginalEditor(), 'line-delete')).toEqual([2])
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([2])
        expect(lineClasses(d.getOriginalEditor(), 'char-delete')).toEqual([])
        expect(d.getModifiedEditor().contentDOM.querySelector('.cm-line span.char-insert')?.textContent).toBe('there')
        expect(d.getOriginalEditor().contentDOM.querySelector('.cm-line span.char-delete')?.textContent).toBe('world')
    })
    it('行号栏有 gutter-insert / gutter-delete 类和 +/- 标记;renderIndicators:false 标记没了、底色还在', () => {
        const d = mount('a\nb\n', 'a\nB\n')
        expect(d.getModifiedEditor().dom.querySelector('.gutter-insert')).not.toBeNull()
        expect(d.getOriginalEditor().dom.querySelector('.gutter-delete')).not.toBeNull()
        expect(d.dom.querySelector('.insert-sign.codicon-add')).not.toBeNull()
        expect(d.dom.querySelector('.delete-sign.codicon-remove')).not.toBeNull()
        d.updateOptions({ renderIndicators: false })
        expect(d.dom.querySelector('.insert-sign')).toBeNull()
        expect(lineClasses(d.getModifiedEditor(), 'line-insert')).toEqual([2])
    })
    it('没有差异 → 一个类都没有', () => {
        const d = mount('a\nb\n', 'a\nb\n')
        expect(d.dom.querySelector('.line-insert, .line-delete')).toBeNull()
    })
})

describe('Diff:对齐空白(view zone)的位置与高度 + .diagonal-fill', () => {
    // 纯插入 2 行 → original 侧在第 1 行之后补 2 行高的空白;modified 侧没有
    it('original 侧的斜纹 = 一块高 2 行的空白,顶部贴在「下一行」上方', () => {
        const d = mount('a\nb\nc\n', 'a\nX\nY\nb\nc\n')
        const lh = d.getOriginalEditor().oracle.lineHeight
        const fills = d.getOriginalEditor().scrollDOM.querySelectorAll<HTMLElement>('.cm-diffFillLayer .diagonal-fill')
        expect(fills.length).toBe(1)
        expect(parseFloat(fills[0].style.height)).toBe(2 * lh)
        // original 的第 2 行(b)在空白之后:行 a 占 [0, lh),空白 [lh, 3lh)
        expect(parseFloat(fills[0].style.top)).toBe(lh)
        expect(d.getModifiedEditor().scrollDOM.querySelectorAll('.diagonal-fill').length).toBe(0)
        // 两侧总高度对齐:original 多出的高度正好是空白高度
        expect(d.getOriginalEditor().metrics.height).toBe(d.getModifiedEditor().metrics.height)
    })
    it('纯删除:空白在 modified 侧,original 侧没有', () => {
        const d = mount('a\nX\nY\nZ\nb\n', 'a\nb\n')
        const lh = d.getModifiedEditor().oracle.lineHeight
        const fills = d.getModifiedEditor().scrollDOM.querySelectorAll<HTMLElement>('.diagonal-fill')
        expect(fills.length).toBe(1)
        expect(parseFloat(fills[0].style.height)).toBe(3 * lh)
        expect(d.getOriginalEditor().scrollDOM.querySelectorAll('.diagonal-fill').length).toBe(0)
    })
    it('末尾追加:空白在 original 文档尾之后(top = 最后一行的 bottom)', () => {
        const d = mount('a\n', 'a\nX\nY')
        const lh = d.getOriginalEditor().oracle.lineHeight
        const fills = d.getOriginalEditor().scrollDOM.querySelectorAll<HTMLElement>('.diagonal-fill')
        expect(fills.length).toBeGreaterThanOrEqual(1)
        const total = [...fills].reduce((s, n) => s + parseFloat(n.style.height), 0)
        expect(total).toBeGreaterThan(0)
        expect(total % lh).toBe(0)
    })
    it('两处改动 → 两块斜纹;改动行数相同(替换)不需要空白', () => {
        const d = mount('a\nb\nc\nd\ne\n', 'a\nX\nb\nc\nd\nY\nZ\ne\n')
        expect(d.getOriginalEditor().scrollDOM.querySelectorAll('.diagonal-fill').length).toBe(2)
        const e = mount('a\nb\nc\n', 'a\nB\nc\n')
        expect(e.getOriginalEditor().scrollDOM.querySelectorAll('.diagonal-fill').length).toBe(0)
        expect(e.getModifiedEditor().scrollDOM.querySelectorAll('.diagonal-fill').length).toBe(0)
    })
    it('斜纹在填充层里,不在 contentDOM 里(不占文字位置、不进选区)', () => {
        const d = mount('a\nb\n', 'a\nX\nb\n')
        expect(d.getOriginalEditor().contentDOM.querySelector('.diagonal-fill')).toBeNull()
        expect(d.getOriginalEditor().scrollDOM.querySelector('.cm-diffFillLayer .diagonal-fill')).not.toBeNull()
    })
    it('没有布局(高度 0)时填充层清空 —— 这是 jsdom 之外需要真浏览器核对的部分', () => {
        const d = mount('a\nb\n', 'a\nX\nb\n')
        const sd = d.getOriginalEditor().scrollDOM
        expect(sd.querySelectorAll('.diagonal-fill').length).toBe(1)
        restores.splice(0).forEach(f => f()) // 撤掉高度桩
        d.layout()
        expect(sd.querySelectorAll('.diagonal-fill').length).toBe(0)
    })
})

describe('Diff:两侧同步滚动', () => {
    it('modified 滚动 → original 的 scrollTop / scrollLeft 跟上;反向亦然;不回声死循环', () => {
        const d = mount(Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n'), Array.from({ length: 80 }, (_, i) => i === 40 ? 'CHANGED' : `line ${i}`).join('\n'))
        const o = d.getOriginalEditor().scrollDOM, m = d.getModifiedEditor().scrollDOM
        scrollable(o, 2000); scrollable(m, 2000)
        m.scrollTop = 120
        m.dispatchEvent(new Event('scroll'))
        expect(o.scrollTop).toBe(120)
        o.scrollTop = 300
        o.dispatchEvent(new Event('scroll'))
        expect(m.scrollTop).toBe(300)
        // 一侧滚到头,另一侧夹到自己的上限
        m.scrollTop = 99999
        m.dispatchEvent(new Event('scroll'))
        expect(o.scrollTop).toBe(2000)
    })
    it('行内视图(renderSideBySide:false)不用同步,原文侧被藏起来', () => {
        const d = mount('a\nb\n', 'a\nB\n', { renderSideBySide: false })
        expect(d.dom.classList.contains('side-by-side')).toBe(false)
    })
})

describe('Diff:概览尺色块与视口滑块', () => {
    const big = (n: number, at: number[]) => Array.from({ length: n }, (_, i) => at.includes(i) ? `CHANGED ${i}` : `line ${i}`).join('\n')
    it('每处改动在对应侧的尺上一块,色用 removed / inserted 前景色;最小 4px', () => {
        const d = mount(big(100, []), big(100, [10, 60]))
        const [orig, mod] = [...d.dom.querySelectorAll<HTMLElement>('.diffOverview .diffOverviewRuler')]
        expect(orig.classList.contains('original')).toBe(true)
        expect(mod.classList.contains('modified')).toBe(true)
        const blocks = (el: HTMLElement) => [...el.children] as HTMLElement[]
        expect(blocks(orig).length).toBe(2)
        expect(blocks(mod).length).toBe(2)
        expect(blocks(orig)[0].style.background).toContain('--lm-diffEditorOverview-removedForeground')
        expect(blocks(mod)[0].style.background).toContain('--lm-diffEditorOverview-insertedForeground')
        const tops = blocks(mod).map(b => parseFloat(b.style.top))
        expect(tops[0]).toBeLessThan(tops[1])
        // 第 61 行 / 第 11 行:位置按文档高度等比缩放(scrollBeyondLastLine 的底部留白让绝对比例小于 0.6,所以比两块之间的比)
        expect(tops[1] / tops[0]).toBeGreaterThan(5)
        expect(tops[1] / tops[0]).toBeLessThan(6.6)
        for (const b of blocks(mod)) expect(parseFloat(b.style.height)).toBeGreaterThanOrEqual(4)
    })
    it('视口滑块:内容比视口高时按比例缩短;随 modified 的滚动移动', () => {
        const d = mount(big(100, []), big(100, [10]))
        const slider = () => d.dom.querySelector<HTMLElement>('.diffOverview .diffViewport')!
        const h0 = parseFloat(slider().style.height)
        expect(h0).toBeGreaterThan(0)
        expect(h0).toBeLessThan(H)
        const top0 = parseFloat(slider().style.top)
        const m = d.getModifiedEditor().scrollDOM
        scrollable(m, 1000)
        m.scrollTop = 500
        m.dispatchEvent(new Event('scroll'))
        expect(parseFloat(slider().style.top)).toBeGreaterThan(top0)
    })
    it('没有差异:两条尺里没有色块', () => {
        const d = mount('a\nb\n', 'a\nb\n')
        for (const r of d.dom.querySelectorAll('.diffOverview .diffOverviewRuler')) expect(r.children.length).toBe(0)
    })
    it('renderOverviewRuler:false → 隐藏(不画)', () => {
        const d = mount('a\n', 'b\n', { renderOverviewRuler: false })
        expect((d.dom.querySelector('.diffOverview') as HTMLElement).style.display).toBe('none')
    })
})

describe('Diff:diffEditor.revert / 回退选区', () => {
    const orig = 'one\ntwo\nthree\nfour\n'
    const mod = 'one\nTWO\nthree\nFOUR\n'
    it('runAction("diffEditor.revert", {mapping}) 把这个 mapping 的字级改动换回 original(Monaco RevertHunkOrSelection)', async () => {
        const d = mount(orig, mod)
        await d.waitForDiff()
        const [first] = d.getMappings()
        expect(d.runAction('diffEditor.revert', { mapping: first })).toBe(true)
        expect(d.getModified()).toBe('one\ntwo\nthree\nFOUR\n')
    })
    it('revertRangeMappings(innerChanges) 一次事务回退多处;diff 没算完(文档刚改)时不动', async () => {
        const d = mount(orig, mod)
        await d.waitForDiff()
        const all = d.getMappings().flatMap(x => x.innerChanges)
        d.revertRangeMappings(all)
        expect(d.getModified()).toBe(orig)
        // 刚编辑完 upToDate=false:不回退
        const e = mount(orig, mod)
        await e.waitForDiff()
        const ch = e.getMappings().flatMap(x => x.innerChanges)
        const v = e.getModifiedEditor()
        v.dispatch(v.state.update({ changes: { from: 0, insert: 'Z' } }))
        e.revertRangeMappings(ch)
        expect(e.getModified()).toBe('Z' + mod)
    })
    it('没有 mapping 的 diffEditor.revert 什么也不做但认得这个 id;没有默认快捷键(Monaco f1:false、无 keybinding)', async () => {
        const d = mount(orig, mod)
        await d.waitForDiff()
        expect(d.runAction('diffEditor.revert')).toBe(true)
        expect(d.getModified()).toBe(mod)
    })
    it('选区非空 → gutter 按钮变 Revert Selection,只回退选区命中的字级改动', async () => {
        const d = mount('a b c\nx y z\n', 'a B c\nx Y z\n')
        await d.waitForDiff()
        const v = d.getModifiedEditor()
        v.dispatch(v.state.update({ selection: { anchor: 2, head: 3 } })) // 选中第一行的 B
        const btns = [...d.dom.querySelectorAll<HTMLElement>('.gutter .gutterItem .action-label')]
        expect(btns.length).toBe(1)
        expect(btns[0].title).toBe('Revert Selection')
        btns[0].click()
        expect(d.getModified()).toBe('a b c\nx Y z\n')
    })
    it('没有选区 → Revert Block,整块回退;只读时按钮没有', async () => {
        const d = mount('a b c\nx y z\n', 'a B c\nx Y z\n')
        await d.waitForDiff()
        const btns = [...d.dom.querySelectorAll<HTMLElement>('.gutter .gutterItem .action-label')]
        expect(btns[0].title).toBe('Revert Block')
        const ro = mount('a\n', 'b\n', { readOnly: true })
        await ro.waitForDiff()
        expect(ro.dom.querySelectorAll('.gutter .gutterItem').length).toBe(0)
    })
})

describe('Diff:readOnly', () => {
    it('readOnly:true → 修改侧 state.readOnly、没有 Revert 按钮和箭头、原文侧本来就只读;false 后恢复', async () => {
        const d = mount('a\nb\n', 'a\nB\n', { readOnly: true })
        await d.waitForDiff()
        expect(d.getModifiedEditor().state.readOnly).toBe(true)
        expect(d.getOriginalEditor().state.readOnly).toBe(true)
        expect(d.dom.querySelectorAll('.gutter .gutterItem').length).toBe(0)
        expect(d.dom.querySelectorAll('.arrow-revert-change').length).toBe(0)
        // 只读时 revert 命令照样回退?—— Monaco 的 gutter 工具栏 when 带 diffEditorModifiedWritable,命令本身不看;这里只断言 UI
        d.updateOptions({ readOnly: false })
        expect(d.getModifiedEditor().state.readOnly).toBe(false)
        expect(d.dom.querySelectorAll('.gutter .gutterItem').length).toBe(1)
    })
    it('editor 级 readOnly 也算(构造时传给编辑器的 readOnly)', () => {
        const d = mount('a\n', 'b\n', { readOnly: true })
        expect(d.getModifiedEditor().state.readOnly).toBe(true)
    })
})
