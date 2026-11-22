import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { indentGuidesCM7, guideLevel, indentUnit, activeIndentGuide } from '../../src/core/feature/indentguides'
import { makeScrolled } from './input-harness'

// provider 是纯函数 state -> DecorationSet:每行前导缩进 depth>=1 挂一条 line deco,
// style 内联 --indent-depth/--indent-width。这里钉「哪几行有线 + 深度/单位对不对」。
function guides(doc: string) {
    const state = EditorState.create({ doc })
    const set = indentGuidesCM7()(state)
    const out: { line: number, style: string }[] = []
    const cur = set.iter()
    while (cur.value) {
        out.push({ line: state.doc.lineAt(cur.from).number, style: (cur.value.spec as { attributes?: { style?: string } }).attributes?.style ?? '' })
        cur.next()
    }
    return out
}

describe('indentGuidesCM7', () => {
    it('无缩进 → 无参考线', () => {
        expect(guides('a\nb\nc')).toEqual([])
    })

    it('2 空格代码:单位探成 2,depth 随嵌套递增', () => {
        // 最小非零缩进 = 2 → 单位 2;第 2 行 2 空格 depth1、第 3 行 4 空格 depth2
        const g = guides('a\n  b\n    c')
        expect(g).toEqual([
            { line: 2, style: '--indent-depth:1;--indent-width:2' },
            { line: 3, style: '--indent-depth:2;--indent-width:2' },
        ])
    })

    it('4 空格代码:单位探成 4', () => {
        const g = guides('fn\n    x\n        y')
        expect(g).toEqual([
            { line: 2, style: '--indent-depth:1;--indent-width:4' },
            { line: 3, style: '--indent-depth:2;--indent-width:4' },
        ])
    })

    it('provider 挂到 view:缩进行 .cm-line 得 cm-indentGuide class', () => {
        // 走 shiki 之外的最小路径:直接把 provider 塞进 decorationProviders 验 DOM 落点
        const state = EditorState.create({ doc: 'a\n  b' })
        const view = new EditorView({
            state,
            decorationProviders: [indentGuidesCM7()],
        })
        const lines = view.contentDOM.querySelectorAll('.cm-line')
        expect(lines[0].classList.contains('cm-indentGuide')).toBe(false)
        expect(lines[1].classList.contains('cm-indentGuide')).toBe(true)
        expect((lines[1] as HTMLElement).style.getPropertyValue('--indent-depth').trim()).toBe('1')
        expect((lines[1] as HTMLElement).style.getPropertyValue('--indent-width').trim()).toBe('2')
    })

    it('有 view 时只给视口邻域挂线', () => {
        const src = indentGuidesCM7()
        const state = EditorState.create({
            doc: Array.from({ length: 80 }, (_, i) => (i % 2 ? '    x' : 'y')).join('\n'),
        })
        const view = new EditorView({
            state,
            decorationProviders: [src],
        })
        const set = src(view.state, view)
        let n = 0
        set.between(0, view.state.doc.length, () => { n++ })
        expect(n).toBeGreaterThan(0)
        expect(n).toBeLessThan(80)
        view.destroy()
    })

    it('大文档视口邻域 = 窗口行 ±40，不扫完全文', () => {
        const doc = Array.from({ length: 400 }, (_, i) => (i % 2 ? '    x' : 'y')).join('\n')
        const view = makeScrolled(doc, { clientHeight: 140, scrollTop: 0, lineHeight: 14, scrollHeight: 400 * 14 })
        const set = indentGuidesCM7()(view.state, view)
        let n = 0
        let minLine = Infinity
        let maxLine = 0
        set.between(0, view.state.doc.length, from => {
            n++
            const line = view.state.doc.lineAt(from).number
            if (line < minLine) minLine = line
            if (line > maxLine) maxLine = line
        })
        const vpEnd = view.state.doc.lineAt(Math.min(view.state.doc.length, view.viewport.to)).number
        expect(n).toBeGreaterThan(0)
        expect(maxLine).toBeLessThanOrEqual(vpEnd + 40)
        expect(n).toBeLessThan(200)
        view.destroy()
    })
})

describe('VS Code 参考线规则(P1-4 / P2-13)', () => {
    const lv = (doc: string) => {
        const s = EditorState.create({ doc })
        const u = indentUnit(s)
        return Array.from({ length: s.doc.lines }, (_, i) => guideLevel(s.doc, i + 1, u, s.tabSize))
    }
    it('JSDoc ` * ` 不把单位拉成 1(旧:最小缩进 → 每列一条线)', () => {
        const doc = '/**\n * a\n */\nfunction f() {\n    if (x) {\n        y()\n    }\n}'
        expect(indentUnit(EditorState.create({ doc }))).toBe(4)
        expect(lv(doc)).toEqual([0, 1, 1, 0, 1, 2, 1, 0])
    })
    it('空行穿过:块内空行取上下层(不断线)', () => {
        expect(lv('{\n    a\n\n    b\n}')).toEqual([0, 1, 1, 1, 0])
        expect(lv('{\n\n    a\n}')).toEqual([0, 1, 1, 0])
        expect(lv('a\n\n')).toEqual([0, 0, 0])
    })
    it('活动线:块头/块尾/块内', () => {
        const doc = 'f {\n    if {\n        x\n        y\n    }\n}'
        const at = (line: number) => {
            const s0 = EditorState.create({ doc })
            const s = s0.applyTransaction(s0.update({ selection: { anchor: s0.doc.line(line).from } }))
            return activeIndentGuide(s)
        }
        expect(at(3)).toEqual({ index: 1, from: 3, to: 4 }) // 块内:外一层
        expect(at(2)).toEqual({ index: 1, from: 3, to: 4 }) // 块头 `if {`:往下
        expect(at(5)).toEqual({ index: 1, from: 3, to: 4 }) // 块尾 `}`:往上
        expect(at(1)).toEqual({ index: 0, from: 2, to: 5 })
    })
})
