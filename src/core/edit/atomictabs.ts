// 原子 Tab(editor.stickyTabStops):行首空白里,左 / 右 / 就近移动一次跳一个缩进单位而不是一个空格。
// 照 Monaco cursorAtomicMoveOperations 移植,纯函数,position 与返回值都是 0 起的行内偏移;-1 = 不适用,回落到普通移动。

import { nextRenderTabStop } from './vcol'

export const enum Direction { Left, Right, Nearest }

const SPACE = 32
const TAB = 9

/**
 * position 处的可见列(只在行首空白里有意义):先碰到非空白字符、或 position 超出行尾,返回 [-1, -1, -1]。
 * 返回 [position 之前最近的 tab stop 的偏移, 它的可见列, position 的可见列]。
 */
export function whitespaceVisibleColumn(line: string, position: number, tabSize: number): [number, number, number] {
    const len = line.length
    let visible = 0
    let prevStopPos = -1
    let prevStopVisible = -1
    for (let i = 0; i < len; i++) {
        if (i === position) return [prevStopPos, prevStopVisible, visible]
        if (visible % tabSize === 0) {
            prevStopPos = i
            prevStopVisible = visible
        }
        const c = line.charCodeAt(i)
        if (c === SPACE) visible += 1
        else if (c === TAB) visible = nextRenderTabStop(visible, tabSize)
        else return [-1, -1, -1]
    }
    if (position === len) return [prevStopPos, prevStopVisible, visible]
    return [-1, -1, -1]
}

/**
 * 原子 Tab 下左移 / 右移 / 就近(鼠标选择)该落到哪;-1 = 不适用。
 * 左移要往右多看一眼:'      foo'(tabSize 4)在偏移 6 按左应该到 5 而不是 4,因为 4..6 不是整个缩进单位。
 */
export function atomicTabPosition(line: string, position: number, tabSize: number, direction: Direction): number {
    const len = line.length
    const [prevStopPos, prevStopVisible, visible] = whitespaceVisibleColumn(line, position, tabSize)
    if (visible === -1) return -1

    let left: boolean
    if (direction === Direction.Left) left = true
    else if (direction === Direction.Right) left = false
    else {
        if (visible % tabSize === 0) return position
        left = visible % tabSize <= tabSize / 2
    }

    if (left) {
        if (prevStopPos === -1) return -1
        let cur = prevStopVisible
        for (let i = prevStopPos; i < len; ++i) {
            if (cur === prevStopVisible + tabSize) return prevStopPos
            const c = line.charCodeAt(i)
            if (c === SPACE) cur += 1
            else if (c === TAB) cur = nextRenderTabStop(cur, tabSize)
            else return -1
        }
        return cur === prevStopVisible + tabSize ? prevStopPos : -1
    }

    const target = nextRenderTabStop(visible, tabSize)
    let cur = visible
    for (let i = position; i < len; i++) {
        if (cur === target) return i
        const c = line.charCodeAt(i)
        if (c === SPACE) cur += 1
        else if (c === TAB) cur = nextRenderTabStop(cur, tabSize)
        else return -1
    }
    return cur === target ? len : -1
}
