// TS 语法树里的「括号跳过」范围(字符串 / 注释 / 正则 / 模板串),纯函数:Worker 里的语言服务用它,不碰编辑器。
// 规则的来龙去脉见 tsbrackets.ts 文件头。

import type * as TS from 'typescript'
import { textChange } from './tsbudget'

/** 一棵 SourceFile 上 [c0, c1) 里的跳过范围:[起, 止, 起, 止…],按起点升序 */
export function skipRangesIn(ts: typeof TS, sf: TS.SourceFile, c0: number, c1: number): number[] {
    const text = sf.text
    const K = ts.SyntaxKind
    const out: number[] = []
    const push = (s: number, e: number) => { if (s < e && e > c0 && s < c1) out.push(s, e) }
    // 空隙:trivia 和标点。里面的 // 和 /* 一定是注释开头;注释整个落在一个空隙里
    const gap = (a: number, b: number) => {
        if (b <= c0 || a >= c1) return
        for (let i = a; i < b - 1; i++) {
            if (text.charCodeAt(i) !== 47) continue
            const c = text.charCodeAt(i + 1)
            if (c === 47) {
                let e = text.indexOf('\n', i)
                if (e < 0) e = text.length
                push(i, e)
                i = e
            }
            else if (c === 42) {
                const e = text.indexOf('*/', i + 2)
                const end = e < 0 ? text.length : e + 2
                push(i, end)
                i = end - 1
            }
        }
    }
    const visit = (n: TS.Node): void => {
        if (n.end <= c0 || n.pos >= c1) return
        const k = n.kind
        if (k === K.JsxText || k === K.JsxTextAllWhiteSpaces) return
        if (k === K.StringLiteral || k === K.RegularExpressionLiteral || (k >= K.NoSubstitutionTemplateLiteral && k <= K.TemplateTail)) {
            const s = n.getStart(sf)
            gap(n.pos, s)
            // 模板串:头 `…${、中 }…${、尾 }…`;${ 的 { 和收尾的 } 是括号
            push(k === K.TemplateMiddle || k === K.TemplateTail ? s + 1 : s, k === K.TemplateHead || k === K.TemplateMiddle ? n.end - 1 : n.end)
            return
        }
        let cur = n.pos
        let stop = n.end
        ts.forEachChild(n, c => {
            if (c.pos >= c1) { stop = Math.max(cur, c.pos); return true }
            gap(cur, c.pos)
            visit(c)
            cur = Math.max(cur, c.end)
            return undefined
        })
        gap(cur, stop)
    }
    visit(sf)
    // forEachChild 基本按源码顺序;保险起见按起点排一次(块内条目很少)
    const pairs: [number, number][] = []
    for (let i = 0; i < out.length; i += 2) pairs.push([out[i], out[i + 1]])
    pairs.sort((x, y) => x[0] - y[0])
    return pairs.flat()
}

function scriptKind(ts: typeof TS, fileName: string): TS.ScriptKind {
    if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX
    if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX
    if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS
    return ts.ScriptKind.TS
}

/** 一份文档的语法树 + 按块缓存的跳过范围 */
export interface TsSkipTree {
    text: string
    sf: TS.SourceFile
    chunks: Map<number, number[]>
    /** 已被增量更新成下一版(updateSourceFile 会改旧树的节点位置),旧谓词不能再算新块 */
    dead?: boolean
}

/** 新建或增量更新(prev 给了就在它上面 updateSourceFile;prev 之后不能再用) */
export function tsSkipTree(ts: typeof TS, fileName: string, text: string, prev?: TsSkipTree | null): TsSkipTree {
    if (prev && prev.text === text) return prev
    const change = prev ? textChange(prev.text, text) : null
    const sf = prev && change
        ? ts.updateSourceFile(prev.sf, text, change)
        : ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, scriptKind(ts, fileName))
    if (prev) prev.dead = true
    return { text, sf, chunks: new Map() }
}

