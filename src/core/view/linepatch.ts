// CM7 增量渲染的删/插计划 —— 纯算术,无 DOM。
//
// patchDOM 变更文档后要在虚拟化视口的 contentDOM.children 里删掉脏行、插入新物化行。
// 「删哪些子节点」是纯坐标换算:把「旧文档受影响行区间」映射成「视口相对子节点下标区间」。
// 抽成纯函数是因为 jsdom 无布局(视口退化为全文),真页虚拟化路径唯有纯 fixture 才测得到。
//
// 坐标系:行号 1-based(文档),子节点下标 0-based(contentDOM.children,视口相对)。
// 不变式 contentDOM.children[i] ≡ 文档第 (viewportStartLine + i) 行。
//
// 关键:patchDOM 跑时,浏览器输入路径(回车拆 div、退格并 div)可能已经改过 contentDOM.children 的
// 数量,所以 childCount 是「变异后」的当前值。删除区上界必须用「稳定尾部」锚定 —— 变更末行之后、仍在
// 视口内、浏览器没碰过的那些行,它们仍原样躺在 children 末尾。尾部数按视口相对算(不是全文档尾,那是
// 老 bug:全文档尾行数远大于视口子节点数,相减得负 → 删除不跑 → 脏行残留)。

export interface LinePatchPlan {
    // 变更行区间与当前视口窗口是否相交。false 时不碰 children。
    intersects: boolean
    // 要删除的子节点半开区间 [childStart, childEnd)(视口相对,0-based)。
    childStart: number
    childEnd: number
}

// oldStartLine:  this.viewportStartLine(视口首行行号,1-based)
// oldEndLine:    编辑前视口末行行号(1-based)= oldDoc.lineAt(this.viewport.to).number
// childCount:    contentDOM.children.length(浏览器变异后的当前子节点数)
// oldFromLine:   oldDoc.lineAt(oldFrom).number(受影响首行,1-based)
// oldToLine:     oldDoc.lineAt(oldTo).number(受影响末行,1-based)
export function planLinePatch(i: {
    oldStartLine: number
    oldEndLine: number
    childCount: number
    oldFromLine: number
    oldToLine: number
}): LinePatchPlan {
    // 变更行区间 [oldFromLine, oldToLine] 与编辑前视口窗口 [oldStartLine, oldEndLine] 相交?
    const intersects = i.oldFromLine <= i.oldEndLine && i.oldToLine >= i.oldStartLine
    if (!intersects) return { intersects: false, childStart: 0, childEnd: 0 }

    // 把变更行区间钳到编辑前渲染窗口内(处理跨视口顶/底)。
    const renderFromLine = Math.max(i.oldFromLine, i.oldStartLine)
    const renderToLine = Math.min(i.oldToLine, i.oldEndLine)

    // 前锚定起点(视口相对,>= 0)。
    const childStart = renderFromLine - i.oldStartLine
    // 稳定尾部:变更末行之后、仍在视口内、未被浏览器触碰的行数。它们仍在 children 末尾。
    // childEnd = 当前子节点数 - 稳定尾部,恰好挖掉变更区(含浏览器拆/并留下的脏节点),不管拆成几个。
    const stableTail = i.oldEndLine - renderToLine
    const childEnd = i.childCount - stableTail
    return { intersects: true, childStart, childEnd }
}

// 滚动换窗：旧视口行窗 ∩ 新视口行窗 → 保留重叠 DOM，只补进出的行。
// 行号 1-based 半开 [start, start+count)。无重叠则 full（整窗重物化）。
export interface ViewportShiftPlan {
    full: boolean
    dropHead: number
    dropTail: number
    prependFrom: number
    prependTo: number
    appendFrom: number
    appendTo: number
}

export function planViewportShift(
    oldStart: number,
    oldCount: number,
    newStart: number,
    newCount: number,
): ViewportShiftPlan {
    const none = { full: true, dropHead: 0, dropTail: 0, prependFrom: 0, prependTo: 0, appendFrom: 0, appendTo: 0 }
    if (oldCount <= 0 || newCount <= 0) return none
    const oldEnd = oldStart + oldCount
    const newEnd = newStart + newCount
    if (newEnd <= oldStart || newStart >= oldEnd) return none
    const keepStart = Math.max(oldStart, newStart)
    const keepEnd = Math.min(oldEnd, newEnd)
    return {
        full: false,
        dropHead: keepStart - oldStart,
        dropTail: oldEnd - keepEnd,
        prependFrom: newStart,
        prependTo: keepStart,
        appendFrom: keepEnd,
        appendTo: newEnd,
    }
}
