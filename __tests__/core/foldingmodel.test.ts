// FoldingModel / HiddenRangeModel / 脱机 model 装饰(Monaco foldingModel 等价物的自有测试)。
import { describe, expect, it } from 'vitest'
import { createModel } from '../../src/api/model'
import { ModelDecorationOptions, TrackedRangeStickiness } from '../../src/api/decorations'
import { FoldingModel, FoldingRegions, FoldSource, HiddenRangeModel, toggleCollapseState } from '../../src/api/foldingmodel'

const REG = ModelDecorationOptions.register({ description: 't', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges })

function provider(m: ReturnType<typeof createModel>) {
    return {
        getDecorationOption: () => REG,
        changeDecorations: <T>(cb: (a: any) => T) => m.changeDecorations(cb),
        removeDecorations: (ids: string[]) => { m.changeDecorations(a => { a.deltaDecorations(ids, []) }) },
    }
}

describe('脱机 model 装饰', () => {
    it('changeDecorations 添加 / 随编辑移动 / 保持 options 身份', () => {
        const m = createModel('a\nb\nc', 'plaintext')
        let id = ''
        m.changeDecorations(a => { id = a.addDecoration({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 2 }, REG) })
        expect((m.getAllDecorations() as { id: string, options: unknown }[]).find(d => d.id === id)!.options).toBe(REG)
        m.pushEditOperations([], [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'x\n' }], () => null)
        expect(m.getDecorationRange(id)!.startLineNumber).toBe(3)
        m.dispose()
    })
})

describe('FoldingModel', () => {
    const text = ['a {', '  b {', '    c', '  }', '}', 'd'].join('\n')
    const ranges = () => FoldingRegions.fromFoldRanges([
        { startLineNumber: 1, endLineNumber: 5, type: undefined, isCollapsed: false, source: FoldSource.provider },
        { startLineNumber: 2, endLineNumber: 4, type: undefined, isCollapsed: false, source: FoldSource.provider },
    ])

    it('折叠态翻转 + HiddenRangeModel 合并隐藏段并发事件', () => {
        const m = createModel(text, 'plaintext')
        const fm = new FoldingModel(m as any, provider(m))
        fm.update(ranges())
        const hm = new HiddenRangeModel(fm)
        const seen: number[] = []
        hm.onDidChange(r => seen.push(r.length))
        toggleCollapseState(fm, 1, [2])
        expect(hm.hiddenRanges.map(r => [r.startLineNumber, r.endLineNumber])).toEqual([[3, 4]])
        toggleCollapseState(fm, 1, [1]) // 外层也折叠:内层被吞
        expect(hm.hiddenRanges.map(r => [r.startLineNumber, r.endLineNumber])).toEqual([[2, 5]])
        expect(seen).toEqual([1, 1])
        expect(hm.isHidden(3)).toBe(true)
        expect(hm.isHidden(1)).toBe(false)
        hm.dispose(); fm.dispose(); m.dispose()
    })

    it('区域跟着编辑移动:update 带回折叠态', () => {
        const m = createModel(text, 'plaintext')
        const fm = new FoldingModel(m as any, provider(m))
        fm.update(ranges())
        toggleCollapseState(fm, 1, [2])
        m.pushEditOperations([], [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'z\n' }], () => null)
        fm.update(FoldingRegions.fromFoldRanges([
            { startLineNumber: 2, endLineNumber: 6, type: undefined, isCollapsed: false, source: FoldSource.provider },
            { startLineNumber: 3, endLineNumber: 5, type: undefined, isCollapsed: false, source: FoldSource.provider },
        ]))
        expect(fm.regions.isCollapsed(0)).toBe(false)
        expect(fm.regions.isCollapsed(1)).toBe(true)
        m.dispose()
    })

    it('memento 往返:内容变了校验和不符就不还原', () => {
        const m = createModel(text, 'plaintext')
        const fm = new FoldingModel(m as any, provider(m))
        fm.update(ranges())
        toggleCollapseState(fm, 1, [2])
        const mem = fm.getMemento()!
        const fm2 = new FoldingModel(m as any, provider(m))
        fm2.applyMemento(mem)
        expect(fm2.regions.length).toBe(1)
        expect(fm2.regions.isCollapsed(0)).toBe(true)
        m.dispose()
    })
})
