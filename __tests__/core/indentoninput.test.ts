import { describe, expect, it } from 'vitest'
import { indentOnCloseBracket, indentOnInput } from '../../src/core/edit/indentoninput'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { inputHandler } from '../../src/core/view/editorview'

// indentOnCloseBracket 纯决策契约:行首打 } ) ] 时把该行缩进拉齐匹配开括号行。
// 钉死:① 触发对齐 ② 已对齐则 null(不产空变更) ③ 光标前有非空白则 null(不是行首闭符)
//   ④ 无匹配开符则 null ⑤ 同行不调 ⑥ )/] 同理 ⑦ 深度计数(跳过嵌套) ⑧ tab 缩进。
// at = 光标位置(闭符将插入处)。

function st(doc: string) {
    return EditorState.create({ doc })
}

describe('indentOnCloseBracket', () => {
    it('行首打 } → 缩进拉齐 { 所在行', () => {
        //  function f() {\n        \n  —— 光标在第2行 8 空格后
        const doc = 'function f() {\n        '
        const at = doc.length
        const r = indentOnCloseBracket(st(doc), at, '}')!
        expect(r).not.toBeNull()
        expect(r.from).toBe(15) // 第2行行首
        expect(r.to).toBe(at)
        expect(r.insert).toBe('}') // { 所在行零缩进 → 目标空缩进 + }
        expect(r.cursor).toBe(16) // from + 0 + 1
    })

    it('缩进块内的 } 拉到开括号行缩进', () => {
        const doc = '  if (x) {\n        ' // { 行有 2 空格缩进
        const at = doc.length
        const r = indentOnCloseBracket(st(doc), at, '}')!
        expect(r.insert).toBe('  }')
        expect(r.cursor).toBe(11 + 2 + 1) // 第2行 from=11
    })

    it('已对齐 → null(不产空变更)', () => {
        const doc = '  if (x) {\n  ' // 当前行已是 2 空格,与 { 行同
        const r = indentOnCloseBracket(st(doc), doc.length, '}')
        expect(r).toBeNull()
    })

    it('光标前有非空白 → null(不是行首闭符)', () => {
        const doc = 'function f() {\n    a'
        const r = indentOnCloseBracket(st(doc), doc.length, '}')
        expect(r).toBeNull()
    })

    it('无匹配开符 → null', () => {
        const doc = '\n    '
        const r = indentOnCloseBracket(st(doc), doc.length, '}')
        expect(r).toBeNull()
    })

    it('开符在同一行 → null', () => {
        const doc = '  { '
        const r = indentOnCloseBracket(st(doc), doc.length, '}')
        expect(r).toBeNull()
    })

    it(') 同理', () => {
        const doc = '  foo(\n        '
        const r = indentOnCloseBracket(st(doc), doc.length, ')')!
        expect(r.insert).toBe('  )')
    })

    it('深度计数:跳过已闭合的嵌套', () => {
        // outer { ... {} ... 闭这个 } 应匹配 outer 的 {(第1行)
        const doc = 'a {\n  b {}\n        '
        const at = doc.length
        const r = indentOnCloseBracket(st(doc), at, '}')!
        expect(r.insert).toBe('}') // 第1行 a { 零缩进
    })

    it('tab 缩进', () => {
        // 目标缩进按当前选项规范化(Monaco normalizeIndentation):这里用 Tab 缩进单元,保持 '\t'
        const doc = '\tif (x) {\n\t\t'
        const r = indentOnCloseBracket(EditorState.create({ doc, extensions: [EditorState.indentUnit.of('\t')] }), doc.length, '}')!
        expect(r.insert).toBe('\t}')
    })

    it('非闭括号字符 → null', () => {
        const doc = 'function f() {\n    '
        expect(indentOnCloseBracket(st(doc), doc.length, 'a')).toBeNull()
    })
})

describe('程序 insert 不走 indentOnInput', () => {
    it('dispatch 插入 } 不对齐；indentOnInput 才拉齐', () => {
        const doc = 'function f() {\n        '
        const host = document.createElement('div')
        document.body.appendChild(host)
        const mk = (d: string) => new EditorView({
            state: EditorState.create({
                doc: d,
                extensions: [inputHandler.of(indentOnInput)],
            }),
            parent: host,
        })
        const viaDispatch = mk(doc)
        viaDispatch.dispatch(viaDispatch.state.update({
            changes: { from: doc.length, insert: '}' },
        }))
        expect(viaDispatch.state.doc.toString()).toBe('function f() {\n        }')
        viaDispatch.destroy()

        const viaHandler = mk(doc)
        expect(indentOnInput(viaHandler, doc.length, doc.length, '}')).toBe(true)
        expect(viaHandler.state.doc.toString()).toBe('function f() {\n}')
        viaHandler.destroy()
        host.remove()
    })
})
