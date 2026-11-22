import { describe, expect, it } from 'vitest'
import { closeBracketChange, closeBracketsInput } from '../../src/core/edit/closebrackets'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { inputHandler } from '../../src/core/view/editorview'

function st(doc: string) {
    return EditorState.create({ doc })
}

describe('closeBracketChange —— 自动配对决策', () => {
    it('开括号补闭符,光标落中间', () => {
        const r = closeBracketChange(st(''), { from: 0, to: 0, insert: '(' }, true)
        expect(r).toEqual({ from: 0, to: 0, insert: '()', cursor: 1 })
    })

    it('四种括号/引号都配对', () => {
        for (const [open, close] of [['[', ']'], ['{', '}'], ['"', '"'], ['\'', '\''], ['`', '`']]) {
            const r = closeBracketChange(st(''), { from: 0, to: 0, insert: open }, true)
            expect(r?.insert).toBe(open + close)
            expect(r?.cursor).toBe(1)
        }
    })

    it('过键:光标后正是同闭符,打闭符→吞插入光标越过', () => {
        // doc "()" 光标在 1(在括号中间),打 ")" → 不插入,光标右移
        const r = closeBracketChange(st('()'), { from: 1, to: 1, insert: ')' }, true)
        expect(r).toEqual({ from: 1, to: 1, insert: '', cursor: 1 })
    })

    it('非过键场景:闭符后不是同符→不干预', () => {
        const r = closeBracketChange(st('a'), { from: 0, to: 0, insert: ')' }, true)
        expect(r).toBeNull()
    })

    it('包裹选区:非空选区被开括号替换→包住内容', () => {
        // doc "hello" 选区 0..5 被 "(" 替换
        const r = closeBracketChange(st('hello'), { from: 0, to: 5, insert: '(' }, false)
        // Monaco:选区留在原内容上(anchor 1 → head 6)
        expect(r).toEqual({ from: 0, to: 5, insert: '(hello)', cursor: 6, anchor: 1 })
    })

    it('引号也包裹选区(Monaco autoSurround languageDefined),选区留在内容上', () => {
        const r = closeBracketChange(st('hi'), { from: 0, to: 2, insert: '"' }, false)
        expect(r).toEqual({ from: 0, to: 2, insert: '"hi"', cursor: 3, anchor: 1 })
    })

    it('开括号后紧跟单词:不补(避免 (foo → ()foo)', () => {
        const r = closeBracketChange(st('foo'), { from: 0, to: 0, insert: '(' }, true)
        expect(r).toBeNull()
    })

    it('开括号后是空白/闭符:补', () => {
        expect(closeBracketChange(st(' x'), { from: 0, to: 0, insert: '(' }, true)?.insert).toBe('()')
        expect(closeBracketChange(st(')'), { from: 0, to: 0, insert: '(' }, true)?.insert).toBe('()')
    })

    it('引号紧贴单词字符:不配对(it\'s / 下标)', () => {
        // prev 是字母
        expect(closeBracketChange(st('it'), { from: 2, to: 2, insert: '\'' }, true)).toBeNull()
        // next 是字母
        expect(closeBracketChange(st('x'), { from: 0, to: 0, insert: '"' }, true)).toBeNull()
    })

    it('多字符插入不干预(粘贴等)', () => {
        expect(closeBracketChange(st(''), { from: 0, to: 0, insert: '()' }, true)).toBeNull()
    })

    it('非空选区打普通字符不干预', () => {
        expect(closeBracketChange(st('abc'), { from: 0, to: 3, insert: 'x' }, false)).toBeNull()
    })
})

describe('程序 insert 不走 inputHandler', () => {
    it('dispatch 插入 ( 不补闭符；closeBracketsInput 才补', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const mk = () => new EditorView({
            state: EditorState.create({
                doc: '',
                extensions: [inputHandler.of(closeBracketsInput)],
            }),
            parent: host,
        })
        const viaDispatch = mk()
        viaDispatch.dispatch(viaDispatch.state.update({ changes: { from: 0, insert: '(' } }))
        expect(viaDispatch.state.doc.toString()).toBe('(')
        viaDispatch.destroy()

        const viaHandler = mk()
        expect(closeBracketsInput(viaHandler, 0, 0, '(')).toBe(true)
        expect(viaHandler.state.doc.toString()).toBe('()')
        viaHandler.destroy()
        host.remove()
    })
})
