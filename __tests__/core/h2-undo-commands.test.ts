// H2:executeEdits / executeCommand(s) / pushUndoStop / popUndoStop。
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, mountEditor } from './h2-helpers'
const { undo, redo } = await import('../../src/core/edit/history')
const { EditorSelection } = await import('../../src/core/model/selection')

afterEach(cleanup)

const R = (a: number, b: number, c: number, d: number) => ({ startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d })
const Sel = (a: number, b: number, c: number, d: number) => ({ selectionStartLineNumber: a, selectionStartColumn: b, positionLineNumber: c, positionColumn: d, ...R(a, b, c, d) })
const doc = (ed: { state: { doc: { toString(): string } } }) => ed.state.doc.toString()
const sels = (ed: { state: { selection: { ranges: { anchor: number, head: number }[] } } }) => ed.state.selection.ranges.map(r => [r.anchor, r.head])

describe('executeEdits', () => {
    it('应用编辑,endCursorState 数组设选区', () => {
        const ed = mountEditor('hello')
        expect(ed.executeEdits('t', [{ range: R(1, 1, 1, 1), text: '>> ' }], [Sel(1, 4, 1, 4)])).toBe(true)
        expect(doc(ed)).toBe('>> hello')
        expect(sels(ed)).toEqual([[3, 3]])
    })

    it('endCursorState 回调拿到逆操作(范围在编辑后坐标)', () => {
        const ed = mountEditor('hello')
        let seen: { range: unknown, text: string }[] = []
        ed.executeEdits('t', [{ range: R(1, 1, 1, 6), text: 'bye' }], (inv: typeof seen) => {
            seen = inv
            return [Sel(1, 4, 1, 4)]
        })
        expect(seen.length).toBe(1)
        expect(seen[0].text).toBe('hello')
        expect(seen[0].range).toMatchObject({ startColumn: 1, endColumn: 4 })
        expect(sels(ed)).toEqual([[3, 3]])
    })

    it('没给 endCursorState:光标随编辑映射', () => {
        const ed = mountEditor('hello')
        ed.dispatch(ed.state.update({ selection: { anchor: 5 } }))
        ed.executeEdits('t', [{ range: R(1, 1, 1, 1), text: 'ab' }])
        expect(sels(ed)).toEqual([[7, 7]])
    })

    it('只读时返回 false 且不改文档', () => {
        const ed = mountEditor('x', { readOnly: true })
        expect(ed.executeEdits('t', [{ range: R(1, 1, 1, 1), text: 'y' }])).toBe(false)
        expect(doc(ed)).toBe('x')
    })

    it('重叠的编辑报错', () => {
        const ed = mountEditor('abcdef')
        expect(() => ed.executeEdits('t', [{ range: R(1, 1, 1, 4), text: 'x' }, { range: R(1, 3, 1, 5), text: 'y' }])).toThrow(/Overlapping/)
    })

    it('多处编辑一次应用,一次 undo 全撤', () => {
        const ed = mountEditor('a b c')
        ed.executeEdits('t', [{ range: R(1, 1, 1, 2), text: 'A' }, { range: R(1, 5, 1, 6), text: 'C' }])
        expect(doc(ed)).toBe('A b C')
        undo(ed)
        expect(doc(ed)).toBe('a b c')
    })
})

describe('pushUndoStop / popUndoStop', () => {
    it('没有 stop:两次 executeEdits 合成一个撤销步', () => {
        const ed = mountEditor('')
        ed.executeEdits('t', [{ range: R(1, 1, 1, 1), text: 'a' }])
        ed.executeEdits('t', [{ range: R(1, 2, 1, 2), text: 'b' }])
        expect(doc(ed)).toBe('ab')
        undo(ed)
        expect(doc(ed)).toBe('')
    })

    it('中间 pushUndoStop:分成两步', () => {
        const ed = mountEditor('')
        ed.executeEdits('t', [{ range: R(1, 1, 1, 1), text: 'a' }])
        expect(ed.pushUndoStop()).toBe(true)
        ed.executeEdits('t', [{ range: R(1, 2, 1, 2), text: 'b' }])
        expect(doc(ed)).toBe('ab')
        undo(ed)
        expect(doc(ed)).toBe('a')
        undo(ed)
        expect(doc(ed)).toBe('')
        redo(ed)
        redo(ed)
        expect(doc(ed)).toBe('ab')
    })

    it('popUndoStop 撤销上一次 pushUndoStop:又合回一步', () => {
        const ed = mountEditor('')
        ed.executeEdits('t', [{ range: R(1, 1, 1, 1), text: 'a' }])
        ed.pushUndoStop()
        ed.popUndoStop()
        ed.executeEdits('t', [{ range: R(1, 2, 1, 2), text: 'b' }])
        undo(ed)
        expect(doc(ed)).toBe('')
    })

    it('只读时返回 false', () => {
        const ed = mountEditor('x', { readOnly: true })
        expect(ed.pushUndoStop()).toBe(false)
        expect(ed.popUndoStop()).toBe(false)
    })
})

describe('executeCommand / executeCommands', () => {
    // 把选区包上括号;computeCursorState 返回 trackSelection 的结果
    const wrapCommand = () => {
        let id = ''
        return {
            getEditOperations(model: { getValueInRange(r: unknown): string }, b: { addEditOperation(r: unknown, t: string): void, trackSelection(s: unknown): string }) {
                const sel = Sel(1, 1, 1, 6)
                id = b.trackSelection(sel)
                b.addEditOperation(R(1, 1, 1, 1), '(')
                b.addEditOperation(R(1, 6, 1, 6), ')')
                void model
            },
            computeCursorState(_m: unknown, h: { getTrackedSelection(id: string): unknown }) {
                return h.getTrackedSelection(id)
            },
        }
    }

    it('getEditOperations + computeCursorState:被追踪的选区跟着内容走', () => {
        const ed = mountEditor('hello world')
        ed.dispatch(ed.state.update({ selection: { anchor: 0, head: 5 } }))
        ed.executeCommand('t', wrapCommand())
        expect(doc(ed)).toBe('(hello) world')
        // 非空选区 stickiness=NeverGrows:选区仍是 hello(含括号外)
        expect(sels(ed)).toEqual([[1, 6]])
    })

    it('computeCursorState 拿到逆操作,可用来定位光标', () => {
        const ed = mountEditor('abc')
        ed.executeCommand('t', {
            getEditOperations(_m: unknown, b: { addEditOperation(r: unknown, t: string): void }) { b.addEditOperation(R(1, 2, 1, 3), 'XYZ') },
            computeCursorState(_m: unknown, h: { getInverseEditOperations(): { range: { endLineNumber: number, endColumn: number } }[] }) {
                const r = h.getInverseEditOperations()[0].range
                return Sel(r.endLineNumber, r.endColumn, r.endLineNumber, r.endColumn)
            },
        })
        expect(doc(ed)).toBe('aXYZc')
        expect(sels(ed)).toEqual([[4, 4]])
    })

    it('命令里的 model 是编辑前快照(getEditOperations)/ 编辑后快照(computeCursorState)', () => {
        const ed = mountEditor('one\ntwo')
        const log: string[] = []
        ed.executeCommand('t', {
            getEditOperations(m: { getValue(): string, getLineCount(): number }, b: { addEditOperation(r: unknown, t: string): void }) {
                log.push(m.getValue(), String(m.getLineCount()))
                b.addEditOperation(R(1, 1, 1, 4), 'ONE\nextra')
            },
            computeCursorState(m: { getValue(): string, getLineCount(): number }) {
                log.push(m.getValue(), String(m.getLineCount()))
                return Sel(1, 1, 1, 1)
            },
        })
        expect(log).toEqual(['one\ntwo', '2', 'ONE\nextra\ntwo', '3'])
    })

    it('executeCommands:每个光标一个命令,各自的选区回到各自结果', () => {
        const ed = mountEditor('aa\nbb')
        ed.dispatch(ed.state.update({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3)], 0) }))
        const mk = (line: number, text: string) => {
            return {
                getEditOperations(_m: unknown, b: { addEditOperation(r: unknown, t: string): void }) { b.addEditOperation(R(line, 1, line, 1), text) },
                computeCursorState(_m: unknown, h: { getInverseEditOperations(): { range: { endLineNumber: number, endColumn: number } }[] }) {
                    const r = h.getInverseEditOperations()[0].range
                    return Sel(r.endLineNumber, r.endColumn, r.endLineNumber, r.endColumn)
                },
            }
        }
        ed.executeCommands('t', [mk(1, '1'), mk(2, '22')])
        expect(doc(ed)).toBe('1aa\n22bb')
        expect(sels(ed)).toEqual([[1, 1], [6, 6]])
        undo(ed)
        expect(doc(ed)).toBe('aa\nbb')
    })

    it('重叠的两个命令:后者(major 大)整条被丢弃', () => {
        const ed = mountEditor('abcdef')
        const cmd = (r: unknown, t: string) => ({
            getEditOperations(_m: unknown, b: { addEditOperation(r: unknown, t: string): void }) { b.addEditOperation(r, t) },
            computeCursorState: () => Sel(1, 1, 1, 1),
        })
        ed.dispatch(ed.state.update({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3)], 0) }))
        ed.executeCommands('t', [cmd(R(1, 1, 1, 4), 'X'), cmd(R(1, 3, 1, 6), 'Y')])
        expect(doc(ed)).toBe('Xdef')
    })
})
