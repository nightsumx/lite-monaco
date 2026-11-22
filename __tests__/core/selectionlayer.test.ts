import { describe, expect, it } from 'vitest'
import { EditorView } from '../../src/core/view/editorview'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import {
    selectionDecorations,
    activeLineDecorations,
    selectionMatchDecorations,
    bracketMatchingDecorations,
} from '../../src/core/feature/selectionlayer'

const multiSel = EditorState.allowMultipleSelections.of(true)

function view(doc: string, sel?: EditorSelection) {
    return new EditorView({
        state: EditorState.create({ doc, selection: sel, extensions: multiSel }),
        drawSelection: true,
    })
}

describe('selectionlayer', () => {
    // 光标不再注入内容流:cm-line 里绝无 cm-cursor,避免占空行编辑锚点、扰乱 contenteditable 选区。
    it('光标不进可编辑内容流:cm-line 内无 cm-cursor', () => {
        const v = view('hello', EditorSelection.single(2))
        expect(v.contentDOM.querySelector('.cm-cursor')).toBeNull()
    })

    it('drawSelection 开启:cm-editor 有独立 cursorLayer overlay', () => {
        const v = view('hello', EditorSelection.single(2))
        expect(v.dom.querySelector('.cm-cursorLayer')).toBeTruthy()
        // cursorLayer 是 contentDOM 的兄弟,不在其内
        expect(v.contentDOM.querySelector('.cm-cursorLayer')).toBeNull()
    })

    it('非空选区:DOM 含 cm-selectionBackground', () => {
        const v = view('hello', EditorSelection.single(0, 3))
        expect(v.contentDOM.querySelector('.cm-selectionBackground')).toBeTruthy()
    })

    it('多选区:每个非空 range 一个 cm-selectionBackground', () => {
        const v = view('abcdef', EditorSelection.create([
            EditorSelection.range(0, 2),
            EditorSelection.range(3, 5),
        ]))
        expect(v.contentDOM.querySelectorAll('.cm-selectionBackground').length).toBe(2)
    })

    it('drawSelection 关闭时:无 cursorLayer 无选区背景', () => {
        const v = new EditorView({
            state: EditorState.create({ doc: 'hello', selection: EditorSelection.single(0, 3) }),
        })
        expect(v.dom.querySelector('.cm-cursorLayer')).toBeNull()
        expect(v.contentDOM.querySelector('.cm-selectionBackground')).toBeNull()
    })

    it('caret-color transparent 隐藏原生光标', () => {
        const v = view('hello')
        expect(v.contentDOM.style.caretColor).toBe('transparent')
    })

    it('selectionDecorations 纯函数:只产选区背景,不产光标', () => {
        const state = EditorState.create({ doc: 'hello', selection: EditorSelection.single(0, 3) })
        const ds = selectionDecorations(state)
        let count = 0
        ds.between(0, 5, () => { count++ })
        expect(count).toBe(1) // 只 1 个 selectionBackground,无光标 widget
    })

    it('空选区:selectionDecorations 不产任何装饰(光标归 overlay)', () => {
        const state = EditorState.create({ doc: 'hello', selection: EditorSelection.single(2) })
        const ds = selectionDecorations(state)
        let count = 0
        ds.between(0, 5, () => { count++ })
        expect(count).toBe(0)
    })
})

describe('activeLineDecorations', () => {
    it('单光标:head 所在行高亮', () => {
        const state = EditorState.create({ doc: 'abc\ndef\nghi', selection: EditorSelection.single(5) })
        const ds = activeLineDecorations(state)
        let count = 0
        ds.between(0, 10, () => { count++ })
        expect(count).toBe(1) // 第 2 行(pos 4)
    })

    it('多光标同行:只一条 line decoration', () => {
        const state = EditorState.create({
            doc: 'abc\ndef',
            selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(2)]),
            extensions: multiSel,
        })
        const ds = activeLineDecorations(state)
        let count = 0
        ds.between(0, 7, () => { count++ })
        expect(count).toBe(1)
    })

    it('多光标跨行:每行一条', () => {
        const state = EditorState.create({
            doc: 'abc\ndef\nghi',
            selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(5)]),
            extensions: multiSel,
        })
        const ds = activeLineDecorations(state)
        let count = 0
        ds.between(0, 11, () => { count++ })
        expect(count).toBe(2)
    })
})

describe('selectionMatchDecorations', () => {
    it('空选区光标在词内:高亮全文同词', () => {
        const state = EditorState.create({ doc: 'foo bar foo baz foo', selection: EditorSelection.single(0) })
        const ds = selectionMatchDecorations(state)
        let count = 0
        ds.between(0, 20, () => { count++ })
        expect(count).toBe(3) // 3 个 foo
    })

    it('非空选区整词:同词 3 处(含自己)+ 选中串 2 处(不含自己)', () => {
        const state = EditorState.create({ doc: 'abc abc xyz abc', selection: EditorSelection.single(0, 3) })
        const ds = selectionMatchDecorations(state)
        let count = 0
        ds.between(0, 15, () => { count++ })
        expect(count).toBe(5)
    })

    it('选区是词内一段:选中串按子串高亮(Monaco SelectionHighlighter 不要求整词),同词照画所在的词', () => {
        // "ab" 在 "abc" 里:选中串 2 处(另两个 abc 的 ab)+ 同词 abc 3 处
        const state = EditorState.create({ doc: 'abc abc abc', selection: EditorSelection.single(0, 2) })
        const ds = selectionMatchDecorations(state)
        let count = 0
        ds.between(0, 11, () => { count++ })
        expect(count).toBe(5)
    })

    it('光标在空白处:无高亮', () => {
        const state = EditorState.create({ doc: 'foo  bar', selection: EditorSelection.single(4) })
        const ds = selectionMatchDecorations(state)
        let count = 0
        ds.between(0, 8, () => { count++ })
        expect(count).toBe(0)
    })

    it('同词超过 200 只挂 200 条', () => {
        const doc = Array.from({ length: 300 }, () => 'foo').join(' ')
        const state = EditorState.create({ doc, selection: EditorSelection.single(0) })
        const ds = selectionMatchDecorations(state)
        let count = 0
        ds.between(0, doc.length, () => { count++ })
        expect(count).toBe(200)
    })
})

describe('bracketMatchingDecorations', () => {
    it('光标在开括号后:高亮匹配对', () => {
        const state = EditorState.create({ doc: '(abc)', selection: EditorSelection.single(1) })
        const ds = bracketMatchingDecorations(state)
        let count = 0
        ds.between(0, 5, () => { count++ })
        expect(count).toBe(2) // ( 和 )
    })

    it('光标在闭括号上:高亮匹配对', () => {
        const state = EditorState.create({ doc: '(abc)', selection: EditorSelection.single(4) })
        const ds = bracketMatchingDecorations(state)
        let count = 0
        ds.between(0, 5, () => { count++ })
        expect(count).toBe(2)
    })

    it('光标不在括号旁:高亮包住它的那一对(Monaco matchBrackets: always 走 findEnclosingBrackets)', () => {
        const state = EditorState.create({ doc: '(abc)', selection: EditorSelection.single(2) })
        const ds = bracketMatchingDecorations(state)
        const froms: number[] = []
        ds.between(0, 5, (from) => { froms.push(from) })
        expect(froms).toEqual([0, 4])
    })

    it('嵌套括号:光标夹在两个开括号之间取右边那只(Monaco 实测 [1,4])', () => {
        const state = EditorState.create({ doc: '((ab))', selection: EditorSelection.single(1) })
        const ds = bracketMatchingDecorations(state)
        const froms: number[] = []
        ds.between(0, 7, (from) => { froms.push(from) })
        // head=1:左边 '(' 配 5,右边 '(' 配 4;bracketPairs.matchBracket 取起点靠右的
        expect(froms).toEqual([1, 4])
    })

    it('多光标:每个空光标各自匹配(Monaco ≤100 个选区都算)', () => {
        const state = EditorState.create({
            doc: '(ab)',
            selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]),
            extensions: multiSel,
        })
        const ds = bracketMatchingDecorations(state)
        const froms: number[] = []
        ds.between(0, 4, (from) => { froms.push(from) })
        expect(froms).toEqual([0, 3])
    })
})
