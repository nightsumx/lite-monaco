// DOM≡doc 双射的**唯一**结构谓词 —— 运行时闸门(update 末尾)与全部 harness 断言共用它,不可能漂移。
//
// 建模:doc 是序列真源(行序列 + pos),contentDOM 是它的投影(.cm-line 序列 + 几何)。
// 一次编辑若悄悄破坏双射(patchDOM 留脏 div、坐标系错配、原生 contenteditable 乱插),没有当场
// 校验就漏成用户报的「大量边界 bug」。这里在唯一漏斗把双射当不变式钉死:dev/test throw,prod no-op。
//
// **只结构、绝不几何**(jsdom 无布局,getClientRects/getBoundingClientRect 退化)。三条谓词:
//   1. 覆盖:按 domLineDocLen 逐 DOM 行累加,doc 跨度必须精确覆盖视口 [start,end]。
//      这是**widget 感知**的行数校验——跨行折叠让 DOM 行数 < doc 行数,朴素 endLine-startLine+1
//      会误报,故按各行实际 doc 长累加(与 dombridge 的 domAtPos/posFromDOM 同一走法)。
//   2. 逐行文本:无 widget 的行其 DOM 文本 === 对应 doc 切片。
//      含 widget 的行(折叠占位、控制字符字形)DOM 文本 ≠ doc 文本,谓词 1 已覆盖其结构,这里跳过。
//   3. 选区界内:main.head/anchor ∈ [0, doc.length]。

import { domLineDocLen } from './dombridge'
import type { EditorView } from './editorview'

// prod 关闸(常量,tsup DCE 掉整个 checkBijection 调用);vitest NODE_ENV='test' → 开。
export const invariantGate = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'

// 行的可见文本:<br> 锚点算空串(不贡献文本长),其余取 textContent。
export function lineText(lineEl: HTMLElement): string {
    if (lineEl.childNodes.length === 1 && lineEl.firstChild!.nodeName === 'BR') return ''
    return lineEl.textContent ?? ''
}

// 首个违规描述,或 null(合法)。O(视口行数)。
export function checkBijection(view: EditorView): string | null {
    const doc = view.state.doc
    const children = view.contentDOM.children
    const startLine = view.viewportStartLine
    const viewportStart = doc.line(startLine).from

    let pos = viewportStart
    for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement
        if (el.classList.contains('cm-blockWidget')) {
            pos += Number(el.getAttribute('data-cm-widget') || 0)
            continue
        }
        const docLen = domLineDocLen(el)
        if (pos + docLen > doc.length)
            return `DOM 行 ${i} 覆盖 doc 越界:pos ${pos}+${docLen} > len ${doc.length}`
        // 无 widget 的行:DOM 文本必须 === 覆盖的 doc 切片(逐行双射)。
        const text = lineText(el)
        if (text.length === docLen && !el.querySelector('[data-cm-widget]')) {
            const slice = doc.sliceString(pos, pos + docLen)
            if (text !== slice)
                return `DOM 行 ${i} 文本 ${JSON.stringify(text)} ≠ doc 切片 ${JSON.stringify(slice)}`
        }
        pos += docLen + 1 // 跨过行内容 + 行间换行
    }
    // 累加后 pos 应落在(末行末 + 1);减回那个换行 = 视口末覆盖到的 doc 位置。
    const covered = children.length ? pos - 1 : viewportStart
    const expectedEnd = doc.lineAt(Math.min(view.viewport.to, doc.length)).to
    if (children.length && covered !== expectedEnd)
        return `DOM 覆盖到 doc ${covered},视口应到 ${expectedEnd}(行数/宽度错配)`

    const main = view.state.selection.main
    if (main.head < 0 || main.head > doc.length || main.anchor < 0 || main.anchor > doc.length)
        return `选区越界:anchor ${main.anchor} head ${main.head}(doc len ${doc.length})`
    return null
}
