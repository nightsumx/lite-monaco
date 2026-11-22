// ⇧⌘, / ⇧⌘. 换成上一个 / 下一个值,逐条对齐 Monaco 0.52 InPlaceReplaceController + editorSimpleWorker.$navigateValueSet
// + BasicInplaceReplace。只看主选区,多行选区不动;结果只剩一个选区,前后各断一次撤销。

import type { StateCommand } from '../model/state'
import { EditorSelection } from '../model/selection'
import { isolateHistory } from './history'
import { USUAL_WORD_SEPARATORS } from './words'

const VALUE_SETS = [
    ['true', 'false'],
    ['True', 'False'],
    ['Private', 'Public', 'Friend', 'ReadOnly', 'Partial', 'Protected', 'WriteOnly'],
    ['public', 'protected', 'private'],
]

function numberReplace(value: string, up: boolean): string | null {
    const precision = Math.pow(10, value.length - (value.lastIndexOf('.') + 1))
    let n = Number(value)
    const n2 = parseFloat(value)
    if (isNaN(n) || isNaN(n2) || n !== n2) return null
    if (n === 0 && !up) return null
    n = Math.floor(n * precision) + (up ? precision : -precision)
    return String(n / precision)
}

function navigate(text: string, up: boolean): string | null {
    const num = numberReplace(text, up)
    if (num !== null) return num
    for (const set of VALUE_SETS) {
        const i = set.indexOf(text)
        if (i >= 0) return set[(i + (up ? 1 : -1) + set.length) % set.length]
    }
    return null
}

const isDigit = (c: string) => c >= '0' && c <= '9'
const isW = (c: string) => isDigit(c) || c === '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
const isWs = (c: string) => c === ' ' || c === '\t' || c === '\v' || c === '\f' || c === ' ' || c === '﻿'

// Monaco DEFAULT_WORD_REGEXP `(-?\d*\.\d\w*)|([^分隔符\s]+)` 从左往右扫,取 start <= col <= end 的第一个
function wordAtCol(text: string, col: number): { start: number, end: number } | null {
    let i = 0
    while (i < text.length && i <= col) {
        let j = i
        if (text[j] === '-') j++
        while (j < text.length && isDigit(text[j])) j++
        let end = -1
        if (text[j] === '.' && j + 1 < text.length && isDigit(text[j + 1])) {
            end = j + 2
            while (end < text.length && isW(text[end])) end++
        }
        if (end < 0) {
            end = i
            while (end < text.length && !isWs(text[end]) && !USUAL_WORD_SEPARATORS.includes(text[end])) end++
        }
        if (end > i) {
            if (col <= end) return { start: i, end }
            i = end
        }
        else i++
    }
    return null
}

function inPlaceReplace(up: boolean): StateCommand {
    return ({ state, dispatch }) => {
        if (state.readOnly) return false
        const sel = state.selection.main
        const line = state.doc.lineAt(sel.from)
        if (sel.to > line.to) return false
        const range = sel.empty ? { from: sel.from, to: Math.min(sel.from + 1, line.to) } : { from: sel.from, to: sel.to }
        const selText = state.sliceDoc(range.from, range.to)
        const w = wordAtCol(line.text, range.from - line.from)
        if (!w) return false
        let edit = range
        let value = selText ? navigate(selText, up) : null
        if (value === null) {
            edit = { from: line.from + w.start, to: line.from + w.end }
            value = navigate(state.sliceDoc(edit.from, edit.to), up)
        }
        if (!value) return false
        // Monaco:新值比选区长 2 个以上字符时把选区往右扩,于是空光标换完也变成选中新值
        const keepSel = !sel.empty || value.length - (sel.to - sel.from) > 1
        const end = edit.from + value.length
        dispatch(state.update({
            changes: { from: edit.from, to: edit.to, insert: value },
            selection: keepSel ? EditorSelection.single(edit.from, end) : EditorSelection.single(Math.min(sel.head, end)),
            scrollIntoView: true,
            userEvent: 'input',
            annotations: isolateHistory.of('full'),
        }))
        return true
    }
}

export const inPlaceReplaceUp: StateCommand = inPlaceReplace(false)
export const inPlaceReplaceDown: StateCommand = inPlaceReplace(true)
