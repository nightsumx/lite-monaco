// Diff 编辑器选项:每个选项在非默认值时真生效(jsdom 能测的)。期望值来自 Monaco 0.52 源码行为。
import { describe, expect, it, vi } from 'vitest'
import { computeLineDiff } from '../../src/core/diff/linediff'
import { diffEditorDefaultOptions, validateDiffEditorOptions, splitDiffOptions } from '../../src/core/diff/options'
import { UnchangedRegion } from '../../src/core/diff/unchanged'
import { createDiffEditor, DiffEditor, type DiffEditorConstructionOptions } from '../../src/diffeditor'
import { getOption } from '../../src/core/index'
import type { ShikiLike } from '../../src/litemonaco'

const hl = {
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getLastGrammarState: () => undefined,
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
} as unknown as ShikiLike

function lines(n: number, mark = new Map<number, string>()) {
    return Array.from({ length: n }, (_, i) => mark.get(i + 1) ?? `line ${i + 1}`).join('\n') + '\n'
}

function mount(original: string, modified: string, extra: Partial<DiffEditorConstructionOptions> = {}, width = 0) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const d = createDiffEditor(parent, { highlighter: hl, lang: 'text', original, modified, ...extra })
    if (width) {
        Object.defineProperty(d.dom, 'clientWidth', { configurable: true, get: () => width })
        d.layout()
    }
    return { d, parent, done: () => { d.destroy(); parent.remove() } }
}

describe('选项校验(Monaco validateDiffEditorOptions)', () => {
    it('默认值', () => {
        const o = validateDiffEditorOptions({}, diffEditorDefaultOptions)
        expect(o).toEqual(diffEditorDefaultOptions)
        expect(o.hideUnchangedRegions).toEqual({ enabled: false, contextLineCount: 3, minimumLineCount: 3, revealLineCount: 20 })
        expect(o.renderSideBySideInlineBreakpoint).toBe(900)
    })
    it('夹取与别名', () => {
        const o = validateDiffEditorOptions({
            splitViewDefaultRatio: 5, maxComputationTime: -3, diffAlgorithm: 'smart' as never, diffWordWrap: 'bogus' as never,
            hideUnchangedRegions: { enabled: true, contextLineCount: -2, minimumLineCount: 1 },
        }, diffEditorDefaultOptions)
        expect(o.splitViewDefaultRatio).toBe(0.9)
        expect(o.maxComputationTime).toBe(0)
        expect(o.diffAlgorithm).toBe('legacy')
        expect(o.diffWordWrap).toBe('inherit')
        expect(o.hideUnchangedRegions.contextLineCount).toBe(0)
        expect(o.hideUnchangedRegions.minimumLineCount).toBe(1)
        expect(o.hideUnchangedRegions.enabled).toBe(true)
    })
    it('splitDiffOptions 把 diff 的项和编辑器的项分开', () => {
        const { diff, editor } = splitDiffOptions({ renderSideBySide: false, fontSize: 20, readOnly: true })
        expect(diff).toEqual({ renderSideBySide: false })
        expect(editor).toEqual({ fontSize: 20, readOnly: true })
    })
})

const fns = Array.from({ length: 12 }, (_, i) => `function number${i}() { return ${i} }`)
const swapped = { a: fns.join('\n'), b: [...fns.slice(6), ...fns.slice(0, 6)].join('\n') }

describe('computeLineDiff', () => {
    it('maxComputationTimeMs 到点就放弃并标 hitTimeout', () => {
        const a = Array.from({ length: 6000 }, (_, i) => `x${(i * 7919) % 6007}`).join('\n')
        const b = Array.from({ length: 6000 }, (_, i) => `x${(i * 104729) % 6007}`).join('\n')
        const r = computeLineDiff(a, b, { maxComputationTimeMs: 1 })
        expect(r.hitTimeout).toBe(true)
        expect(computeLineDiff('a\nb', 'a\nc').hitTimeout).toBe(false)
    })
    it('computeMoves 找出整块搬家', () => {
        const { a, b } = swapped
        expect(computeLineDiff(a, b).moves).toEqual([])
        const r = computeLineDiff(a, b, { computeMoves: true })
        expect(r.moves.length).toBe(1)
        expect(r.moves[0]).toMatchObject({ originalStart: 1, originalEnd: 7, modifiedStart: 7, modifiedEnd: 13 })
    })
})

describe('UnchangedRegion', () => {
    it('fromDiffs:首尾 + 中间,留 contextLineCount 行上下文', () => {
        const [m] = computeLineDiff(lines(30), lines(30, new Map([[15, 'X']]))).changes.map(x => x)
        const rs = UnchangedRegion.fromDiffs([m], 30, 30, 3, 3)
        expect(rs.length).toBe(2)
        expect(rs[0].getHiddenModifiedRange()).toMatchObject({ start: 1, end: 12 })
        expect(rs[1].getHiddenModifiedRange()).toMatchObject({ start: 19, end: 31 })
        rs[0].showAll()
        expect(rs[0].getHiddenModifiedRange().end - rs[0].getHiddenModifiedRange().start).toBe(0)
        rs[0].collapseAll()
        expect(rs[0].hiddenLineCount).toBeGreaterThan(0)
    })
})

describe('DiffEditor 选项', () => {
    it('默认:并排、原侧只读、修改侧可编辑', () => {
        const { d, done } = mount('a\nb\n', 'a\nB\n')
        expect(d.dom.classList.contains('side-by-side')).toBe(true)
        expect(d.getOriginalEditor().state.readOnly).toBe(true)
        expect(d.getModifiedEditor().state.readOnly).toBe(false)
        done()
    })
    it('originalEditable:true 原侧可编辑,并且 updateOptions 能切回', () => {
        const { d, done } = mount('a\nb\n', 'a\nB\n', { originalEditable: true })
        expect(d.getOriginalEditor().state.readOnly).toBe(false)
        d.updateOptions({ originalEditable: false })
        expect(d.getOriginalEditor().state.readOnly).toBe(true)
        done()
    })
    it('readOnly:修改侧只读、gutter 菜单没了', () => {
        const { d, done } = mount('a\nb\n', 'a\nB\n', { readOnly: true })
        expect(d.getModifiedEditor().state.readOnly).toBe(true)
        expect(d.dom.querySelectorAll('.gutter .gutterItem').length).toBe(0)
        d.updateOptions({ readOnly: false })
        expect(d.getModifiedEditor().state.readOnly).toBe(false)
        expect(d.dom.querySelectorAll('.gutter .action-label').length).toBe(1)
        done()
    })
    it('renderSideBySide:false → 行内:无 side-by-side,被删行进了修改侧', () => {
        const { d, done } = mount('a\nOLD\nc\n', 'a\nNEW\nc\n', { renderSideBySide: false })
        expect(d.dom.classList.contains('side-by-side')).toBe(false)
        expect(d.getOriginalEditor().state.readOnly).toBe(true)
        const del = d.dom.querySelectorAll('.cm-diffBlockLayer .inline-deleted-lines .inline-deleted-text-line')
        expect(del.length).toBe(1)
        expect(del[0].textContent).toContain('OLD')
        d.updateOptions({ renderSideBySide: true })
        expect(d.dom.classList.contains('side-by-side')).toBe(true)
        expect(d.dom.querySelectorAll('.inline-deleted-lines').length).toBe(0)
        done()
    })
    it('窄屏自动转行内:宽度 ≤ renderSideBySideInlineBreakpoint;useInlineViewWhenSpaceIsLimited:false 不转', () => {
        const { d, done } = mount('a\nb\n', 'a\nB\n', {}, 500)
        expect(d.dom.classList.contains('side-by-side')).toBe(false)
        d.toggleUseInlineViewWhenSpaceIsLimited()
        expect(d.dom.classList.contains('side-by-side')).toBe(true)
        d.runAction('diffEditor.toggleUseInlineViewWhenSpaceIsLimited')
        expect(d.dom.classList.contains('side-by-side')).toBe(false)
        d.updateOptions({ renderSideBySideInlineBreakpoint: 400 })
        expect(d.dom.classList.contains('side-by-side')).toBe(true)
        done()
    })
    it('compactMode:全是纯插入 / 纯删除的 diff 一律行内', () => {
        const a = mount('a\nb\n', 'a\nb\nc\n', { compactMode: true })
        expect(a.d.dom.classList.contains('side-by-side')).toBe(false)
        a.done()
        const b = mount('a\nb\n', 'a\nB\n', { compactMode: true })
        expect(b.d.dom.classList.contains('side-by-side')).toBe(true)
        b.done()
    })
    it('splitViewDefaultRatio / enableSplitViewResizing', () => {
        const { d, done } = mount('a\n', 'b\n', { splitViewDefaultRatio: 0.3, enableSplitViewResizing: false }, 1000)
        expect((d.dom.querySelector('.editor.modified') as HTMLElement).style.left).toBe('291px')
        expect((d.dom.querySelector('.diff-sash') as HTMLElement).style.pointerEvents).toBe('none')
        d.updateOptions({ enableSplitViewResizing: true })
        expect((d.dom.querySelector('.diff-sash') as HTMLElement).style.pointerEvents).toBe('')
        done()
    })
    it('分隔条能拖,双击复位', () => {
        const { d, done } = mount('a\n', 'b\n', {}, 1000)
        const sash = d.dom.querySelector('.diff-sash') as HTMLElement
        const mod = d.dom.querySelector('.editor.modified') as HTMLElement
        const before = mod.style.left
        sash.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, bubbles: true }))
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500 }))
        window.dispatchEvent(new MouseEvent('pointerup'))
        expect(parseInt(mod.style.left)).toBe(parseInt(before) + 100)
        sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        expect(mod.style.left).toBe(before)
        done()
    })
    it('renderOverviewRuler:false 概览尺消失', () => {
        const { d, done } = mount('a\n', 'b\n', { renderOverviewRuler: false })
        expect((d.dom.querySelector('.diffOverview') as HTMLElement).style.display).toBe('none')
        d.updateOptions({ renderOverviewRuler: true })
        expect((d.dom.querySelector('.diffOverview') as HTMLElement).style.display).toBe('')
        expect(d.dom.querySelectorAll('.diffOverview .diffOverviewRuler').length).toBe(2)
        expect(d.dom.querySelector('.diffOverview .diffViewport')).not.toBeNull()
        done()
    })
    it('renderIndicators:false 没有 +/- 标记', () => {
        const a = mount('a\n', 'b\n')
        expect(a.d.dom.querySelectorAll('.insert-sign').length).toBeGreaterThan(0)
        a.done()
        const b = mount('a\n', 'b\n', { renderIndicators: false })
        expect(b.d.dom.querySelectorAll('.insert-sign, .delete-sign').length).toBe(0)
        b.done()
    })
    it('ignoreTrimWhitespace:false → 缩进变化算改动', () => {
        const a = mount('if (x) {\nfoo()\n}\n', 'if (x) {\n    foo()\n}\n')
        expect(a.d.getMappings().length).toBe(0)
        a.d.updateOptions({ ignoreTrimWhitespace: false })
        expect(a.d.getMappings().length).toBe(1)
        a.done()
    })
    it('experimental.showEmptyDecorations:false 去掉空范围标记', () => {
        const a = mount('foo(bar, baz)\n', 'foo(bar, qux, baz)\n')
        expect(a.d.dom.querySelectorAll('.diff-range-empty').length).toBeGreaterThan(0)
        a.done()
        const b = mount('foo(bar, baz)\n', 'foo(bar, qux, baz)\n', { experimental: { showEmptyDecorations: false } })
        expect(b.d.dom.querySelectorAll('.diff-range-empty').length).toBe(0)
        b.done()
    })
    it('diffWordWrap: on / off / inherit', () => {
        const a = mount('a\n', 'b\n', { diffWordWrap: 'on' })
        expect(a.d.getModifiedEditor().lineWrapping).toBe(true)
        a.d.updateOptions({ diffWordWrap: 'off' })
        expect(a.d.getModifiedEditor().lineWrapping).toBe(false)
        a.done()
        const b = mount('a\n', 'b\n', { features: { lineWrapping: true } })
        expect(b.d.getModifiedEditor().lineWrapping).toBe(true)
        b.done()
    })
    it('两侧编辑器选项:fontSize 等扁平项传到两侧', () => {
        const { d, done } = mount('a\n', 'b\n', { fontSize: 20 })
        expect(getOption(d.getOriginalEditor().state, 'fontSize')).toBe(20)
        expect(getOption(d.getModifiedEditor().state, 'fontSize')).toBe(20)
        d.updateOptions({ fontSize: 12 })
        expect(getOption(d.getModifiedEditor().state, 'fontSize')).toBe(12)
        expect(getOption(d.getOriginalEditor().state, 'fontSize')).toBe(12)
        done()
    })
    it('renderGutterMenu:false + renderMarginRevertIcon → 旧式回退箭头;关掉就没有', () => {
        const a = mount('a\nb\n', 'a\nB\n', { renderGutterMenu: false })
        expect(a.d.dom.querySelectorAll('.gutter .gutterItem').length).toBe(0)
        const arrows = a.d.dom.querySelectorAll('.arrow-revert-change')
        expect(arrows.length).toBe(1)
        ;(arrows[0] as HTMLElement).click()
        expect(a.d.getModified()).toBe('a\nb\n')
        a.done()
        const b = mount('a\nb\n', 'a\nB\n', { renderGutterMenu: false, renderMarginRevertIcon: false })
        expect(b.d.dom.querySelectorAll('.arrow-revert-change').length).toBe(0)
        b.done()
    })
    it('maxComputationTime 超时 → quitEarly(用假时钟让小文本也超时)', () => {
        let t = 0
        const spy = vi.spyOn(Date, 'now').mockImplementation(() => (t += 50))
        try {
            const { d, done } = mount(lines(40), lines(40, new Map([[10, 'X'], [30, 'Y']])), { maxComputationTime: 20 })
            expect(d.getDiffComputationResult()!.quitEarly).toBe(true)
            done()
        } finally { spy.mockRestore() }
        const { d, done } = mount(lines(40), lines(40, new Map([[10, 'X']])), { maxComputationTime: 0 })
        expect(d.getDiffComputationResult()!.quitEarly).toBe(false)
        done()
    })
})

describe('折叠未改区域', () => {
    const mk = () => mount(lines(40), lines(40, new Map([[20, 'CHANGED']])), { hideUnchangedRegions: { enabled: true } })
    it('开启后首尾两段被替换成控制条;toggle / collapseAll / showAll', () => {
        const { d, done } = mk()
        const hidden = () => d.getModifiedEditor().contentDOM.querySelectorAll('.diff-hidden-lines-widget').length
        expect(d.getModifiedEditor().state.doc.lines).toBe(41)
        expect(hidden()).toBeGreaterThan(0)
        d.showAllUnchangedRegions()
        expect(hidden()).toBe(0)
        d.collapseAllUnchangedRegions()
        expect(hidden()).toBeGreaterThan(0)
        d.runAction('diffEditor.expandAllUnchangedRegions')
        expect(hidden()).toBe(0)
        d.runAction('diffEditor.toggleCollapseUnchangedRegions')
        expect(hidden()).toBe(0)
        d.runAction('diffEditor.toggleCollapseUnchangedRegions')
        expect(hidden()).toBeGreaterThan(0)
        done()
    })
    it('contextLineCount / minimumLineCount 生效', () => {
        const { d, done } = mk()
        const before = d.getModifiedEditor().contentDOM.querySelector('.diff-hidden-lines .center .first, .diff-hidden-lines .center')!.textContent
        d.updateOptions({ hideUnchangedRegions: { contextLineCount: 8 } })
        const after = d.getModifiedEditor().contentDOM.querySelector('.diff-hidden-lines .center .first, .diff-hidden-lines .center')!.textContent
        expect(after).not.toBe(before)
        d.updateOptions({ hideUnchangedRegions: { minimumLineCount: 100 } })
        expect(d.getModifiedEditor().contentDOM.querySelectorAll('.diff-hidden-lines-widget').length).toBe(0)
        done()
    })
    it('光标进入折叠的行 → 展开', () => {
        const { d, done } = mk()
        const v = d.getModifiedEditor()
        v.dispatch(v.state.update({ selection: { anchor: v.state.doc.line(5).from } }))
        const w = v.contentDOM.querySelectorAll('.diff-hidden-lines-widget')
        expect(w.length).toBeGreaterThan(0)
        const text = v.contentDOM.textContent!
        expect(text).toContain('line 5')
        done()
    })
    it('整个文件没改动:不折叠', () => {
        const { d, done } = mount(lines(40), lines(40), { hideUnchangedRegions: { enabled: true } })
        expect(d.getModifiedEditor().contentDOM.querySelectorAll('.diff-hidden-lines-widget').length).toBe(0)
        done()
    })
})

describe('移动块', () => {
    const { a, b } = swapped
    it('experimental.showMoves:画连线、caption、行装饰', () => {
        const { d, done } = mount(a, b, { experimental: { showMoves: true } })
        expect(d.getDiffComputationResult()!.moves.length).toBe(1)
        expect(d.dom.querySelectorAll('.moved-blocks-lines path').length).toBe(1)
        expect(d.dom.querySelectorAll('.diff-moved-code-block').length).toBe(2)
        expect(d.dom.querySelectorAll('.movedModified.moved-first').length).toBe(1)
        expect(d.dom.querySelectorAll('.movedOriginal.moved-last').length).toBe(1)
        done()
    })
    it('默认不做移动检测;运行时可开关', () => {
        const { d, done } = mount(a, b)
        expect(d.getDiffComputationResult()!.moves.length).toBe(0)
        d.runAction('diffEditor.toggleShowMovedCodeBlocks')
        expect(d.getDiffComputationResult()!.moves.length).toBe(1)
        d.updateOptions({ experimental: { showMoves: false } })
        expect(d.dom.querySelectorAll('.diff-moved-code-block').length).toBe(0)
        done()
    })
})

describe('无障碍 diff 查看器', () => {
    const open = (d: DiffEditor) => d.dom.querySelector('.accessibleDiffViewer .diff-review') as HTMLElement | null
    it('F7 打开,再按 F7 跳下一组,Shift+F7 上一组,Esc 关闭', () => {
        const { d, done } = mount(lines(30), lines(30, new Map([[3, 'X'], [20, 'Y']])))
        expect(open(d)!.style.display === 'none' || open(d)!.childElementCount === 0 || !open(d)!.classList.contains('visible')).toBeTruthy()
        d.runAction('editor.action.accessibleDiffViewer.next')
        const rows = () => [...d.dom.querySelectorAll('.diff-review-row')].map(r => r.textContent)
        expect(rows().some(t => t!.includes('@@'))).toBe(true)
        expect(rows().join('\n')).toContain('X')
        d.runAction('editor.action.accessibleDiffViewer.next')
        expect(rows().join('\n')).toContain('Y')
        d.runAction('editor.action.accessibleDiffViewer.prev')
        expect(rows().join('\n')).toContain('X')
        ;(d.dom.querySelector('.diff-review-actions .close-diff-review') as HTMLElement).click()
        expect((d.dom.querySelector('.editor.modified') as HTMLElement).style.visibility).toBe('visible')
        done()
    })
    it('onlyShowAccessibleDiffViewer 一开始就显示且关不掉', () => {
        const { d, done } = mount('a\n', 'b\n', { onlyShowAccessibleDiffViewer: true })
        expect((d.dom.querySelector('.editor.modified') as HTMLElement).style.visibility).toBe('hidden')
        expect(d.dom.querySelector('.close-diff-review')).toBeNull()
        d.updateOptions({ onlyShowAccessibleDiffViewer: false })
        expect((d.dom.querySelector('.editor.modified') as HTMLElement).style.visibility).toBe('visible')
        done()
    })
})

describe('宿主 API', () => {
    it('onDidUpdateDiff / getLineChanges / getDiffComputationResult', async () => {
        const { d, done } = mount('a\nb\nc\n', 'a\nB\nc\nd\n')
        let n = 0
        const sub = d.onDidUpdateDiff(() => { n++ })
        const lc = d.getLineChanges()!
        expect(lc.map(x => [x.originalStartLineNumber, x.originalEndLineNumber, x.modifiedStartLineNumber, x.modifiedEndLineNumber]))
            .toEqual([[2, 2, 2, 2], [3, 0, 4, 4]])
        expect(lc[0].charChanges![0]).toMatchObject({ originalStartLineNumber: 2, originalStartColumn: 1, originalEndColumn: 2, modifiedEndColumn: 2 })
        expect(lc[1].charChanges).toBeUndefined()
        const r = d.getDiffComputationResult()!
        expect(r).toMatchObject({ identical: false, quitEarly: false })
        d.getModifiedEditor().dispatch(d.getModifiedEditor().state.update({ changes: { from: 0, insert: 'z' } }))
        await d.waitForDiff()
        expect(n).toBe(1)
        sub.dispose()
        d.getModifiedEditor().dispatch(d.getModifiedEditor().state.update({ changes: { from: 0, insert: 'z' } }))
        await d.waitForDiff()
        expect(n).toBe(1)
        done()
    })
    it('identical 看文本是否一样', () => {
        const { d, done } = mount('a\n', 'a\n')
        expect(d.getDiffComputationResult()!.identical).toBe(true)
        d.setModel({ original: 'a\n', modified: 'b\n' })
        expect(d.getDiffComputationResult()!.identical).toBe(false)
        // Monaco 的 getModel() 返回 IDiffEditorModel(两个 ITextModel);文本用 getValue 读
        expect(d.getModel()!.original.getValue()).toBe('a\n')
        expect(d.getModel()!.modified.getValue()).toBe('b\n')
        done()
    })
    it('revealFirstDiff 选中第一处改动', async () => {
        const { d, done } = mount(lines(30), lines(30, new Map([[12, 'X']])))
        d.revealFirstDiff()
        await d.waitForDiff()
        await Promise.resolve()
        const v = d.getModifiedEditor()
        expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(12)
        done()
    })
    it('switchSide / mapToOtherSide 把光标换算到另一侧', () => {
        const { d, done } = mount('a\nb\nc\n', 'a\nx\ny\nb\nc\n')
        const v = d.getModifiedEditor()
        v.focus()
        v.dispatch(v.state.update({ selection: { anchor: v.state.doc.line(4).from + 1 } }))
        const m = d.mapToOtherSide()
        expect(d.getOriginalEditor().state.doc.lineAt(m.destinationSelection!.head).number).toBe(2)
        done()
    })
    it('runAction 不认识的 id 返回 false', () => {
        const { d, done } = mount('a\n', 'b\n')
        expect(d.runAction('nope')).toBe(false)
        done()
    })
})

describe('diffAlgorithm', () => {
    const a = 'if (x) {\n  foo(bar, baz)\n  keep\n}\nend\n'
    const b = 'if (x) {\n  foo(bar, qux, baz)\n  keep\n  more\n}\nend\n'
    it('legacy:行区间同 Monaco 旧算法,字级改动是闭区间转出来的偏移', () => {
        const r = computeLineDiff(a, b, { algorithm: 'legacy' })
        expect(r.changes.map(c => [c.originalStart, c.originalEnd, c.modifiedStart, c.modifiedEnd])).toEqual([[2, 3, 2, 3], [4, 4, 4, 5]])
        const inner = r.changes[0].innerChanges[0]
        expect(a.slice(inner.originalFrom, inner.originalTo)).toBe('')
        expect(b.slice(inner.modifiedFrom, inner.modifiedTo)).toBe('qux, ')
        expect(r.moves).toEqual([])
    })
    it('legacy 的 hitTimeout 与空文件快路径', () => {
        expect(computeLineDiff('', 'a\nb', { algorithm: 'legacy' }).changes.length).toBe(1)
        expect(computeLineDiff('a', 'a', { algorithm: 'legacy' }).changes).toEqual([])
    })
    it('DiffEditor:diffAlgorithm 切到 legacy 重算,不再有移动块', () => {
        const { d, done } = mount(swapped.a, swapped.b, { experimental: { showMoves: true } })
        expect(d.getDiffComputationResult()!.moves.length).toBe(1)
        d.updateOptions({ diffAlgorithm: 'legacy' })
        expect(d.getDiffComputationResult()!.moves.length).toBe(0)
        expect(d.getMappings().length).toBeGreaterThan(0)
        done()
    })
})
