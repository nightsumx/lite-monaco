// renderWhitespace 五个取值(Monaco:none / boundary / selection / trailing / all)
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { selectionDecorations } from '../../src/core/feature/selectionlayer'

const marks = (doc: string, options: IEditorOptions, sel?: [number, number]) => {
    const state = EditorState.create({
        doc, extensions: [editorOptions.of(options)],
        selection: sel ? EditorSelection.single(sel[0], sel[1]) : undefined,
    })
    const out: string[] = []
    for (const it = selectionDecorations(state).iter(); it.value; it.next()) {
        const cls = (it.value.spec as { class?: string }).class
        if (cls !== 'cm-selectionBackground') out.push(`${cls}:${it.from}-${it.to}`)
    }
    return out
}
const doc = '  a b  c\t \n\td  '

describe('renderWhitespace', () => {
    it('默认 selection:不选就没有标记;选中了才画选区内的空白', () => {
        expect(marks(doc, {})).toEqual([])
        expect(marks(doc, {}, [0, 5])).toEqual(['cm-selWs:0-2', 'cm-selWs:3-4'])
    })
    it('none:选区里也不画', () => {
        expect(marks(doc, { renderWhitespace: 'none' }, [0, 5])).toEqual([])
    })
    it('all:所有空格游程和每个 tab', () => {
        expect(marks(doc, { renderWhitespace: 'all' })).toEqual([
            'cm-selWs:0-2', 'cm-selWs:3-4', 'cm-selWs:5-7', 'cm-selTab:8-9', 'cm-selWs:9-10',
            'cm-selTab:11-12', 'cm-selWs:13-15',
        ])
    })
    it('boundary:词间单个空格不画,行首 / 多空格 / 行尾 / tab 画', () => {
        expect(marks(doc, { renderWhitespace: 'boundary' })).toEqual([
            'cm-selWs:0-2', 'cm-selWs:5-7', 'cm-selTab:8-9', 'cm-selWs:9-10', 'cm-selTab:11-12', 'cm-selWs:13-15',
        ])
    })
    it('trailing:只画行尾的空白(行尾「tab + 空格」是同一段行尾空白,两个都画,同 Monaco)', () => {
        expect(marks(doc, { renderWhitespace: 'trailing' })).toEqual(['cm-selTab:8-9', 'cm-selWs:9-10', 'cm-selWs:13-15'])
    })
    it('trailing:整行空白也算行尾', () => {
        expect(marks('a\n   \nb', { renderWhitespace: 'trailing' })).toEqual(['cm-selWs:2-5'])
    })
})
