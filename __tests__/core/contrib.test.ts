import { describe, expect, it } from 'vitest'
import { matchBackward, matchForward } from '../../src/core/edit/brackets'
import { bracketColorDecorations } from '../../src/core/feature/bracketcolor'
import type { ScopedShiki } from '../../src/core/view/tokens'
import { indentOf, leadingCols } from '../../src/core/edit/indent'
import { decorations, EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSet } from '../../src/core/model/rangeset'
import { ChangeSet } from '../../src/core/model/change'
import { LineWidthMap, LineWidthOracle } from '../../src/core/view/linewidthmap'
import { Rope } from '../../src/core/model/rope'
import { rulerPalette } from '../../src/product/theme'
import { minimapCM7 } from '../../src/core/chrome/minimap'
import { vScrollbarCM7 } from '../../src/core/chrome/vscrollbar'
import { hScrollbarCM7 } from '../../src/core/chrome/hscrollbar'
import { overviewRulerCM7 } from '../../src/core/chrome/overviewruler'
import { attachOverlay } from '../../src/core/feature/overlay'

describe('brackets —— 一对深度扫', () => {
    it('matchForward / matchBackward 互逆', () => {
        const t = 'a(b[c]d)e'
        const close = matchForward(t, '(', 1)
        expect(close).toBe(7)
        expect(matchBackward(t, ')', close)).toBe(1)
        expect(matchForward(t, '[', 3)).toBe(5)
        expect(matchBackward(t, ']', 5)).toBe(3)
    })

    it('嵌套同种括号', () => {
        expect(matchForward('(())', '(', 0)).toBe(3)
        expect(matchForward('(())', '(', 1)).toBe(2)
    })

    it('无匹配 → -1', () => {
        expect(matchForward('(abc', '(', 0)).toBe(-1)
        expect(matchBackward('abc)', ')', 3)).toBe(-1)
    })
})

describe('bracketColorDecorations', () => {
    const hl = {
        codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0 }]] }),
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['ts'],
    } as unknown as ScopedShiki

    it('成对括号上色；空 palette 不画', () => {
        const state = EditorState.create({ doc: '(a[b])' })
        const empty = bracketColorDecorations(hl, state, { lang: 'ts', theme: 't' }, [])
        let n = 0
        empty.between(0, 6, () => { n++ })
        expect(n).toBe(0)
        const set = bracketColorDecorations(hl, state, { lang: 'ts', theme: 't' }, ['#f00', '#0f0'])
        n = 0
        set.between(0, 6, () => { n++ })
        expect(n).toBeGreaterThan(0)
    })
})

describe('indent —— 一列深度', () => {
    it('indentOf 空白行 = -1，其余 = leadingCols', () => {
        expect(indentOf('')).toBe(-1)
        expect(indentOf('   ')).toBe(-1)
        expect(indentOf('    foo')).toBe(4)
        expect(indentOf('\tfoo')).toBe(leadingCols('\tfoo', 4))
    })
})

describe('decorations facet 收 DecoSource', () => {
    it('extensions 里的函数装饰进 DOM', () => {
        const mark = Decoration.mark({ class: 'kw' })
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'hello',
                extensions: [decorations.of(() => RangeSet.of([mark.range(0, 5)], true))],
            }),
            parent: host,
        })
        expect(view.contentDOM.querySelector('.kw')).not.toBeNull()
        view.destroy()
        host.remove()
    })
})

describe('EditorView.overlays 构造即挂、destroy 卸', () => {
    it('mount 一次，destroy 调卸载', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        let mounted = 0
        let disposed = 0
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent: host,
            overlays: [() => {
                mounted++
                return () => { disposed++ }
            }],
        })
        expect(mounted).toBe(1)
        expect(disposed).toBe(0)
        view.destroy()
        expect(disposed).toBe(1)
        host.remove()
    })

    it('attachOverlay 挂上后事务会 redraw，卸载摘 DOM', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent: host,
        })
        let redraws = 0
        const off = attachOverlay(view, {
            mount: v => {
                const el = document.createElement('div')
                el.className = 'qa-ov'
                v.dom.appendChild(el)
                return el
            },
            redraw: () => { redraws++ },
        })
        expect(view.dom.querySelector('.qa-ov')).not.toBeNull()
        expect(redraws).toBeGreaterThanOrEqual(1)
        view.dispatch(view.state.update({ selection: { anchor: 1 } }))
        expect(redraws).toBeGreaterThanOrEqual(2)
        off()
        expect(view.dom.querySelector('.qa-ov')).toBeNull()
        view.destroy()
        host.remove()
    })

    it('minimap / 竖条 / 横条 / 概览条挂上进 DOM，destroy 卸', () => {
        const palette = rulerPalette({ bg: '#1e1e1e', fg: '#d4d4d4', dark: true })
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x\ny' }),
            parent: host,
            overlays: [
                minimapCM7({} as ScopedShiki, { lang: 'ts', theme: 't' }, palette),
                vScrollbarCM7(palette),
                hScrollbarCM7(),
                overviewRulerCM7(palette),
            ],
        })
        expect(view.dom.querySelector('.cm-minimap')).not.toBeNull()
        expect(view.dom.querySelector('.cm-scrollbar')).not.toBeNull()
        expect(view.dom.querySelector('.cm-hscrollbar')).not.toBeNull()
        expect(view.dom.querySelector('.cm-overviewRuler')).not.toBeNull()
        view.destroy()
        expect(view.dom.querySelector('.cm-minimap')).toBeNull()
        expect(view.dom.querySelector('.cm-scrollbar')).toBeNull()
        expect(view.dom.querySelector('.cm-hscrollbar')).toBeNull()
        expect(view.dom.querySelector('.cm-overviewRuler')).toBeNull()
        host.remove()
    })
})

describe('metrics —— 几何真源', () => {
    it('view.metrics.height === heightMap.height，contentWidth === lineWidthMap', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({ doc: 'abc\ndef' }),
            parent: host,
        })
        expect(view.metrics.height).toBe(view.heightMap.height)
        expect(view.metrics.contentWidth).toBe(view.lineWidthMap.contentWidth())
        view.destroy()
        host.remove()
    })

    it('删最宽行 → contentWidth 跌', () => {
        const o = new LineWidthOracle(false)
        o.charWidth = 7
        const oldDoc = Rope.of(['short', 'a'.repeat(20), 'mid'])
        o.setDoc(oldDoc)
        const m = new LineWidthMap(o)
        m.measureWidth(1, 35)
        m.measureWidth(2, 140)
        m.measureWidth(3, 21)
        expect(m.maxLineWidth).toBe(140)
        const newDoc = Rope.of(['short', 'mid'])
        const changes = ChangeSet.of([{ from: 6, to: 27, insert: '' }], oldDoc.length)
        m.applyChanges(changes, oldDoc, newDoc)
        expect(m.maxLineWidth).toBeLessThan(140)
        expect(m.contentWidth()).toBe(m.maxLineWidth)
    })
})
