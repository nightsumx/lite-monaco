// 输入模式 insert / overtype(Monaco InputMode:全局单例,不跟编辑器实例走)。
// overtype 下打字 / 粘贴(overtypeOnPaste)/ 组合输入结束,会把光标后面等长的文本吃掉(不跨行)。

import type { ChangeSpec } from '../model/change'
import type { EditorState } from '../model/state'

export type InputModeName = 'insert' | 'overtype'

let mode: InputModeName = 'insert'
const listeners = new Set<(m: InputModeName) => void>()

export const InputMode = {
    getInputMode: (): InputModeName => mode,
    setInputMode(next: InputModeName): void {
        mode = next
        for (const l of [...listeners]) l(mode)
    },
    onDidChangeInputMode(fn: (m: InputModeName) => void): { dispose(): void } {
        listeners.add(fn)
        return { dispose: () => { listeners.delete(fn) } }
    },
}

/**
 * Monaco ReplaceOvertypeCommand 的区间:[from, to] 换成长度 len 的文本时,实际要换掉的区间。
 * 空区间吃掉后面 len 个字符,非空区间吃掉 len-1 个(选区本身算一个);都不越过 to 所在行的行尾。
 */
export function overtypeRange(state: EditorState, from: number, to: number, len: number): { from: number, to: number } {
    const line = state.doc.lineAt(to)
    const delta = len + (from === to ? 0 : -1)
    return { from, to: Math.min(line.to, to + Math.max(0, delta)) }
}

/** overtype 模式下把一条替换改写成「吃掉后面字符」的版本;insert 模式原样 */
export function overtypeChange(state: EditorState, c: { from: number, to: number, insert: string }): ChangeSpec {
    if (mode !== 'overtype') return c
    const r = overtypeRange(state, c.from, c.to, c.insert.length)
    return { from: r.from, to: r.to, insert: c.insert }
}
