// K3:useTabStops / trimAutoWhitespace / autoIndent
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { deleteCharBackward, indentLess, indentMore, insertNewlineAndIndent } from '../../src/core/edit/commands'
import { commentTokensFacet } from '../../src/core/edit/commenttokens'
import { modelOptionsExtension } from '../../src/core/edit/modeloptions'
import { indentConfig } from '../../src/core/edit/enter'
import { history } from '../../src/core/edit/history'
import { indentRulesFacet, autoIndentFacet } from '../../src/core/edit/autoindent'

type Cmd = (t: never) => boolean
function mk(doc: string, options: IEditorOptions, sel = EditorSelection.cursor(doc.length), extra: unknown[] = []) {
    return EditorState.create({ doc, selection: sel, extensions: [editorOptions.of(options), commentTokensFacet.of({ line: '//', block: { open: '/*', close: '*/' } }), ...extra as never[]] })
}
function run(state: EditorState, ...cmds: Cmd[]) {
    for (const cmd of cmds) cmd({ state, dispatch: (tr: { apply(): EditorState }) => { state = tr.apply() } } as never)
    return state
}
const text = (s: EditorState) => s.doc.toString()

describe('useTabStops', () => {
    it('默认 true:缩进里退格删到上一个缩进停靠点', () => {
        expect(text(run(mk('      ', {}), deleteCharBackward as Cmd))).toBe('    ')
    })
    it('false:退格一次删一个空格', () => {
        expect(text(run(mk('      ', { useTabStops: false }), deleteCharBackward as Cmd))).toBe('     ')
    })
    it('Tab 缩进多行:默认对齐 tab stop(2 空格 → 4),false 整体多加一级(2 → 6)', () => {
        const sel = EditorSelection.range(0, 7)
        expect(text(run(mk('  a\n  b', {}, sel), indentMore as Cmd))).toBe('    a\n    b')
        expect(text(run(mk('  a\n  b', { useTabStops: false }, sel), indentMore as Cmd))).toBe('      a\n      b')
    })
    it('⇧Tab:默认回到上一个 tab stop(6 → 4),false 删一整级(6 → 2)', () => {
        const sel = EditorSelection.range(0, 7)
        expect(text(run(mk('      a\n      b', {}, EditorSelection.range(0, 13)), indentLess as Cmd))).toBe('    a\n    b')
        expect(text(run(mk('      a\n      b', { useTabStops: false }, EditorSelection.range(0, 13)), indentLess as Cmd))).toBe('  a\n  b')
        void sel
    })
    it('false + insertSpaces=false 时加 Tab', () => {
        expect(text(run(mk('a\nb', { useTabStops: false }, EditorSelection.range(0, 3), [modelOptionsExtension({ insertSpaces: false })]), indentMore as Cmd))).toBe('\ta\n\tb')
    })
})

describe('trimAutoWhitespace', () => {
    // 缩进行回车产生一个纯空白行,再回车:默认把上一个自动缩进行清空
    const twice = (options: IEditorOptions) => text(run(mk('    a', options, undefined, [history()]), insertNewlineAndIndent as Cmd, insertNewlineAndIndent as Cmd))
    it('默认 true:连按回车,中间的纯缩进行被清空', () => {
        expect(twice({})).toBe('    a\n\n    ')
    })
    it('false:保留空白', () => {
        expect(twice({ trimAutoWhitespace: false } as never)).toBe('    a\n    \n    ')
    })
})

describe('autoIndent', () => {
    const enter = (doc: string, autoIndent: IEditorOptions['autoIndent'] | undefined) =>
        text(run(mk(doc, autoIndent ? { autoIndent } : {}), insertNewlineAndIndent as Cmd))
    it("'none':回车不带缩进", () => { expect(enter('    a', 'none')).toBe('    a\n') })
    it("'keep':只带当前行缩进,括号后不多缩一级", () => { expect(enter('    a {', 'keep')).toBe('    a {\n    ') })
    it("'brackets':括号后多缩一级", () => { expect(enter('    a {', 'brackets')).toBe('    a {\n        ') })
    it("'advanced' / 默认:括号后多缩一级", () => {
        expect(enter('    a {', 'advanced')).toBe('    a {\n        ')
        expect(enter('    a {', undefined)).toBe('    a {\n        ')
    })
    it("'brackets' 没有 onEnterRules:块注释后不补 ' * ','advanced' 补", () => {
        expect(enter('/**', 'brackets')).toBe('/**\n')
        expect(enter('/**', 'advanced')).toBe('/**\n * ')
    })
    it("'full' + indentationRules 生效;默认(advanced)不看规则", () => {
        const rules = indentRulesFacet.of({ increaseIndentPattern: /^.*:\s*$/, decreaseIndentPattern: /^\s*end$/ })
        const go = (autoIndent?: IEditorOptions['autoIndent']) =>
            text(run(mk('if x:', autoIndent ? { autoIndent } : {}, undefined, [rules]), insertNewlineAndIndent as Cmd))
        expect(go()).toBe('if x:\n')
        expect(go('advanced')).toBe('if x:\n')
        expect(go('full')).toBe('if x:\n    ')
        // 显式 facet 仍然优先
        expect(text(run(mk('if x:', {}, undefined, [rules, autoIndentFacet.of('full')]), insertNewlineAndIndent as Cmd))).toBe('if x:\n    ')
    })
})

describe('tabSize / indentSize / insertSpaces / detectIndentation', () => {
    const cfg = (raw: Record<string, unknown>, doc = '') => {
        const st = EditorState.create({ doc, extensions: [editorOptions.of(raw as never), modelOptionsExtension(raw, doc)] })
        return { ...indentConfig(st), unit: st.indentUnit }
    }
    it('没配任何东西:不动宿主的默认(4 / 空格)', () => {
        expect(cfg({})).toMatchObject({ tabSize: 4, indentSize: 4, insertSpaces: true })
    })
    it('tabSize / insertSpaces / indentSize', () => {
        expect(cfg({ tabSize: 2 })).toMatchObject({ tabSize: 2, indentSize: 2, insertSpaces: true })
        expect(cfg({ tabSize: 8, insertSpaces: false })).toMatchObject({ tabSize: 8, indentSize: 8, insertSpaces: false, unit: '\t' })
        expect(cfg({ tabSize: 8, indentSize: 2 })).toMatchObject({ tabSize: 8, indentSize: 2, insertSpaces: true })
        expect(cfg({ tabSize: 3, indentSize: 'tabSize' })).toMatchObject({ tabSize: 3, indentSize: 3 })
    })
    it('tabSize < 1 夹到 1', () => {
        expect(cfg({ tabSize: 0 }).tabSize).toBe(1)
    })
    it('detectIndentation 默认 true:按内容猜空格宽度', () => {
        const doc = 'a {\n  b {\n    c\n  }\n}\n'
        expect(cfg({}, doc)).toMatchObject({ tabSize: 2, indentSize: 2, insertSpaces: true })
        // 猜出来的盖过选项里的 tabSize(Monaco resolveOptions)
        expect(cfg({ tabSize: 8 }, doc)).toMatchObject({ tabSize: 2, indentSize: 2 })
    })
    it('detectIndentation 默认 true:Tab 缩进的文件 → insertSpaces=false', () => {
        const doc = 'a {\n\tb\n\tc\n}\n'
        expect(cfg({}, doc)).toMatchObject({ insertSpaces: false, unit: '\t' })
    })
    it('detectIndentation=false:不猜,用选项', () => {
        const doc = 'a {\n  b\n  c\n}\n'
        expect(cfg({ detectIndentation: false, tabSize: 4 }, doc)).toMatchObject({ tabSize: 4, insertSpaces: true })
        expect(cfg({ detectIndentation: false }, '\ta\n\tb')).toMatchObject({ insertSpaces: true })
    })
    it('内容没缩进线索:不盖宿主用 EditorState.tabSize 配的值', () => {
        const st = EditorState.create({ doc: 'a\nb', extensions: [EditorState.tabSize.of(3), modelOptionsExtension({}, 'a\nb')] })
        expect(st.tabSize).toBe(3)
    })
})
