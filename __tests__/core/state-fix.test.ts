// Compartment reconfigure 语义(对齐 CM6):compartment.of(x) 与 compartment 本身是同一个槽;
// reconfigure 后所有 facet 重算;被移出的 field 丢弃、新加的 field 只 create 不 update、保留的 field 值保留。
import { describe, expect, it } from 'vitest'
import { Compartment, EditorState, Facet, StateField } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}

describe('Compartment.of + reconfigure', () => {
    it('comp.of(tabSize 4) → reconfigure(tabSize 2) 后 state.tabSize = 2', () => {
        const comp = new Compartment()
        const s = EditorState.create({ extensions: [comp.of(EditorState.tabSize.of(4))] })
        expect(s.tabSize).toBe(4)
        const s2 = s.update({ effects: comp.reconfigure(EditorState.tabSize.of(2)) }).apply()
        expect(s2.tabSize).toBe(2)
        expect(comp.get(s2)).toBe(s2.config.compartments.get(comp))
    })

    it('indentUnit / readOnly / lineSeparator / allowMultipleSelections / wordChars 都随 reconfigure 重算', () => {
        const comp = new Compartment()
        const s = EditorState.create({ doc: 'a\nb', extensions: [comp.of([])] })
        expect([s.indentUnit, s.readOnly, s.lineBreak, s.facet(EditorState.wordChars)]).toEqual(['    ', false, '\n', ''])
        const s2 = s.update({
            effects: comp.reconfigure([
                EditorState.indentUnit.of('\t'),
                EditorState.readOnly.of(true),
                EditorState.lineSeparator.of('\r\n'),
                EditorState.wordChars.of('$'),
                EditorState.allowMultipleSelections.of(true),
            ]),
        }).apply()
        expect([s2.indentUnit, s2.readOnly, s2.lineBreak, s2.facet(EditorState.wordChars)]).toEqual(['\t', true, '\r\n', '$'])
        // 多选区开关在同一个事务里就生效(新配置裁选区)
        const multi = s2.update({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(2)]) }).apply()
        expect(multi.selection.ranges.length).toBe(2)
        const back = multi.update({ effects: comp.reconfigure([]) }).apply()
        expect([back.indentUnit, back.readOnly, back.lineBreak]).toEqual(['    ', false, '\n'])
        expect(back.selection.ranges.length).toBe(1)
    })

    it('自定义 facet:同一槽多次 reconfigure,每次都重算 combine', () => {
        const sum = Facet.define<number, number>({ combine: vs => vs.reduce((a, b) => a + b, 0) })
        const comp = new Compartment()
        let s = EditorState.create({ extensions: [sum.of(1), comp.of(sum.of(10))] })
        expect(s.facet(sum)).toBe(11)
        s = s.update({ effects: comp.reconfigure([sum.of(2), sum.of(3)]) }).apply()
        expect(s.facet(sum)).toBe(6)
        s = s.update({ effects: comp.reconfigure(sum.of(100)) }).apply()
        expect(s.facet(sum)).toBe(101)
    })
})

describe('reconfigure 下的 StateField', () => {
    const counter = () => StateField.define<number>({ create: () => 0, update: (v, tr) => v + (tr.docChanged ? 1 : 0) })

    it('被移出的 field 丢弃;再加回来重新 create', () => {
        const f = counter()
        const comp = new Compartment()
        let s = EditorState.create({ extensions: [comp.of(f)] })
        s = s.update({ changes: { from: 0, insert: 'x' } }).apply()
        expect(s.field(f)).toBe(1)
        s = s.update({ effects: comp.reconfigure([]) }).apply()
        expect(s.field(f, false)).toBeUndefined()
        s = s.update({ effects: comp.reconfigure(f) }).apply()
        expect(s.field(f)).toBe(0)
    })

    it('新加的 field 只 create(看到新配置和新文档),不再拿本事务 update', () => {
        const f = counter()
        const seen = StateField.define<string>({ create: st => `${st.tabSize}:${st.doc.toString()}`, update: v => v })
        const comp = new Compartment()
        const s = EditorState.create({ doc: 'a', extensions: [comp.of([])] })
        const s2 = s.update({ changes: { from: 1, insert: 'b' }, effects: comp.reconfigure([f, seen, EditorState.tabSize.of(2)]) }).apply()
        expect(s2.field(f)).toBe(0)
        expect(s2.field(seen)).toBe('2:ab')
    })

    it('保留的 field 值保留且照常 update(同一事务里改文档也算)', () => {
        const f = counter()
        const comp = new Compartment()
        let s = EditorState.create({ extensions: [f, comp.of(EditorState.tabSize.of(4))] })
        s = s.update({ changes: { from: 0, insert: 'x' } }).apply()
        s = s.update({ changes: { from: 0, insert: 'y' }, effects: comp.reconfigure(EditorState.tabSize.of(2)) }).apply()
        expect(s.field(f)).toBe(2)
        expect(s.tabSize).toBe(2)
    })

    it('create 读别的 field:按依赖取值,不受声明顺序影响', () => {
        const base = StateField.define<number>({ create: () => 5, update: v => v })
        const derived = StateField.define<number>({ create: st => st.field(base) * 2, update: v => v })
        const s = EditorState.create({ extensions: [derived, base] })
        expect(s.field(derived)).toBe(10)
        const comp = new Compartment()
        const s2 = EditorState.create({ extensions: [comp.of([])] })
            .update({ effects: comp.reconfigure([derived, base]) }).apply()
        expect(s2.field(derived)).toBe(10)
    })
})

describe('嵌套 compartment', () => {
    it('外槽 reconfigure 时内槽内容沿用;内槽被移出后再出现用新给的内容', () => {
        const outer = new Compartment(), inner = new Compartment()
        let s = EditorState.create({ extensions: outer.of(inner.of(EditorState.tabSize.of(4))) })
        s = s.update({ effects: inner.reconfigure(EditorState.tabSize.of(2)) }).apply()
        expect(s.tabSize).toBe(2)
        // 外槽换了但内槽还在:内槽保留 reconfigure 过的内容(CM6 同)
        s = s.update({ effects: outer.reconfigure([inner.of(EditorState.tabSize.of(8)), EditorState.indentUnit.of('\t')]) }).apply()
        expect([s.tabSize, s.indentUnit]).toEqual([2, '\t'])
        // 内槽移出 → 内容丢弃;再放回来用新的 .of 内容
        s = s.update({ effects: outer.reconfigure([]) }).apply()
        expect(inner.get(s)).toBeUndefined()
        s = s.update({ effects: outer.reconfigure(inner.of(EditorState.tabSize.of(8))) }).apply()
        expect(s.tabSize).toBe(8)
    })

    it('不在配置里的 compartment 的 reconfigure 不生效', () => {
        const comp = new Compartment(), stray = new Compartment()
        const s = EditorState.create({ extensions: comp.of(EditorState.tabSize.of(4)) })
        const s2 = s.update({ effects: stray.reconfigure(EditorState.tabSize.of(2)) }).apply()
        expect(s2.tabSize).toBe(4)
    })
})

describe('lite-monaco 运行时改配置', () => {
    it('extensions 里的 comp.of(tabSize) 运行时 reconfigure:state 与 --lm-tab-size 都跟上;liteMonaco({state}) 恢复后保留', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const comp = new Compartment()
        const features = { minimap: false, autocomplete: false, hover: false } as const
        const a = liteMonaco({ parent, highlighter: fakeHl(), doc: '\tx', lang: 'text', features, extensions: [comp.of(EditorState.tabSize.of(4))] })
        a.dispatch(a.state.update({ effects: comp.reconfigure(EditorState.tabSize.of(2)) }))
        expect(a.state.tabSize).toBe(2)
        expect(a.dom.style.getPropertyValue('--lm-tab-size')).toBe('2')
        const saved = a.state
        a.destroy()
        const b = liteMonaco({ parent, highlighter: fakeHl(), state: saved, lang: 'text', features, extensions: [comp.of(EditorState.tabSize.of(4))] })
        expect(b.state.tabSize).toBe(2)
        b.dispatch(b.state.update({ effects: comp.reconfigure(EditorState.tabSize.of(8)) }))
        expect(b.state.tabSize).toBe(8)
        expect(b.dom.style.getPropertyValue('--lm-tab-size')).toBe('8')
        b.destroy()
        parent.remove()
    })
})
