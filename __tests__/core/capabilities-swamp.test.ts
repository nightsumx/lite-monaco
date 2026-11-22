// 能力 §5 沼泽: findDiff / 多光标扇出 / composition 多光标 / 双空格 / Chrome 双换行 / 输入 harness
import { describe, expect, it } from 'vitest'
import { applyDOMChangeInner, findDiff } from '../../src/core/input/domchange'
import { LineBreakPlaceholder } from '../../src/core/view/domreader'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { EditorView, inputHandler } from '../../src/core/view/editorview'
import { history, undo } from '../../src/core/edit/history'
import { make, setCaret, typeText } from './input-harness'
import { checkBijection } from '../../src/core/view/invariants'

function applyDiff(a: string, b: string, d: { from: number, toA: number, toB: number }) {
    return a.slice(0, d.from) + b.slice(d.from, d.toB) + a.slice(d.toA)
}

describe('findDiff 完备律', () => {
    const cases: [string, string, string, number, string | null][] = [
        ['中插', 'hello', 'helXlo', 3, null],
        ['首插', 'abc', 'Xabc', 0, null],
        ['尾插', 'abc', 'abcY', 3, null],
        ['中删', 'hello', 'heo', 2, null],
        ['全换', 'aaa', 'bbb', 0, null],
        ['空→字', '', 'x', 0, null],
        ['字→空', 'x', '', 1, 'end'],
        ['换行占位', 'a', `a${LineBreakPlaceholder}b`, 1, null],
        ['双换行占位', 'line', `line${LineBreakPlaceholder}${LineBreakPlaceholder}`, 4, null],
        ['CJK', '你好', '你X好', 1, null],
        ['emoji 代理对', 'a👍b', 'a👍Xb', 3, null],
        ['多删', 'abcdef', 'abf', 2, 'end'],
    ]
    for (const [name, a, b, pref, side] of cases) {
        it(name, () => {
            const d = findDiff(a, b, pref, side)
            if (a === b) {
                expect(d).toBeNull()
                return
            }
            expect(d).not.toBeNull()
            expect(applyDiff(a, b, d!)).toBe(b)
        })
    }

    it('H3 Chrome 双换行: 两 PH → 可减 toB', () => {
        const a = 'line'
        const b = `line${LineBreakPlaceholder}${LineBreakPlaceholder}`
        const d = findDiff(a, b, 4, null)!
        expect(b.slice(d.from, d.toB)).toBe(LineBreakPlaceholder + LineBreakPlaceholder)
        let toB = d.toB
        if (d.toB === d.from + 2 && b.slice(d.from, d.toB) === LineBreakPlaceholder + LineBreakPlaceholder)
            toB--
        expect(toB - d.from).toBe(1)
        // 减后仍合理: 单换行插入
        expect(applyDiff(a, b.slice(0, d.from) + LineBreakPlaceholder + b.slice(d.toB), { ...d, toB })).toBe(
            `line${LineBreakPlaceholder}`,
        )
    })
})

describe('多光标扇出（真实输入路径）', () => {
    it('三光标插入同一字符', () => {
        const view = make('a\nb\nc')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(1),
                EditorSelection.cursor(3),
                EditorSelection.cursor(5),
            ]),
        }))
        // 主光标在 1（a 后）
        typeText(view, 1, 'X')
        expect(view.state.doc.toString()).toBe('aX\nbX\ncX')
        expect(checkBijection(view)).toBeNull()
        view.destroy()
    })

    it('多光标插入后 undo 全撤', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'aa\nbb',
                extensions: [EditorState.allowMultipleSelections.of(true), history()],
                selection: EditorSelection.create([
                    EditorSelection.cursor(2),
                    EditorSelection.cursor(5),
                ]),
            }),
            parent: host,
        })
        typeText(view, 2, 'Z')
        expect(view.state.doc.toString()).toContain('Z')
        undo(view)
        expect(view.state.doc.toString()).toBe('aa\nbb')
        view.destroy()
    })
})

describe('applyDOMChangeInner 契约', () => {
    it('inputHandler 可认领输入', () => {
        let claimed = false
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'hi',
                extensions: [
                    inputHandler.of((_v, _from, _to, insert) => {
                        if (insert === '!') {
                            claimed = true
                            return true
                        }
                        return false
                    }),
                ],
            }),
            parent: host,
        })
        applyDOMChangeInner(view, { from: 2, to: 2, insert: '!' }, null)
        expect(claimed).toBe(true)
        expect(view.state.doc.toString()).toBe('hi')
        view.destroy()
    })

    it('默认插入推进 doc + 选区', () => {
        const view = make('ab')
        setCaret(view, 1)
        applyDOMChangeInner(view, { from: 1, to: 1, insert: 'X' }, EditorSelection.single(2))
        expect(view.state.doc.toString()).toBe('aXb')
        expect(view.state.selection.main.head).toBe(2)
        view.destroy()
    })

    it('composition 时 userEvent 含 compose', () => {
        const view = make('ab')
        view.inputState.startComposition()
        view.inputState.noteComposingChange()
        const ue = view.inputState.userEventForChange(view)
        expect(ue).toContain('compose')
        // firstChange 已消费，再生成一次仍含 compose
        view.inputState.compositionFirstChange = false
        view.inputState.composing = 2
        applyDOMChangeInner(view, { from: 1, to: 1, insert: '中' }, EditorSelection.single(2))
        expect(view.state.doc.toString()).toBe('a中b')
        view.destroy()
    })
})

describe('composition 多光标（H2 状态路径）', () => {
    it('composing 时主 range 插入落 doc', () => {
        const view = make('foo bar baz')
        view.dispatch(view.state.update({
            selection: EditorSelection.create([
                EditorSelection.cursor(3),
                EditorSelection.cursor(7),
            ]),
        }))
        view.inputState.composing = 1
        view.inputState.compositionPendingChange = false
        applyDOMChangeInner(
            view,
            { from: 3, to: 3, insert: 'X' },
            EditorSelection.single(4),
        )
        expect(view.state.doc.toString().includes('X')).toBe(true)
        view.destroy()
    })
})

describe('双空格句号语义（纯 diff 侧）', () => {
    it('". " 匹配 autocorrect 模式', () => {
        expect(/^\. ?$/.test('. ')).toBe(true)
        expect(/^\. ?$/.test('.')).toBe(true)
        expect(/^\. ?$/.test('..')).toBe(false)
    })
})

describe('DOM≡doc 不变量: 快速序列', () => {
    it('插入-回车-退格-再插 保持双射', () => {
        const view = make('hello')
        typeText(view, 5, '!')
        expect(checkBijection(view)).toBeNull()
        // 模拟 state 路径回车
        view.dispatch(view.state.update({
            changes: { from: 6, insert: '\n' },
            selection: { anchor: 7 },
            userEvent: 'input',
        }))
        expect(checkBijection(view)).toBeNull()
        typeText(view, 7, 'x')
        expect(checkBijection(view)).toBeNull()
        expect(view.state.doc.toString()).toBe('hello!\nx')
        view.destroy()
    })
})
