// 片段展开 —— Monaco/VS Code 子集: $0 $1 ${1:default} ${1:${2:x}} ${1|a,b|} \\$ 。
// 接受补全后写入纯文本 + 光标落 $0;多处 $n 经 snippetSession 用 Tab 跳。

export interface SnippetStop {
    /** 展开后在插入文本中的绝对偏移(相对插入起点) */
    pos: number
    order: number
    /** 占位默认长(选中替换用) */
    len: number
}

export interface ExpandedSnippet {
    text: string
    /** 按 order 排序的跳位点;$0 通常最后 */
    stops: SnippetStop[]
}

function findMatchingBrace(s: string, openAt: number, until: number): number {
    let depth = 0
    for (let i = openAt; i < until; i++) {
        if (s[i] === '\\' && i + 1 < until) { i++; continue }
        if (s[i] === '{') depth++
        else if (s[i] === '}') {
            depth--
            if (depth === 0) return i
        }
    }
    return -1
}

function parsePart(template: string, from: number, until: number): { text: string, stops: SnippetStop[] } {
    let text = ''
    const stops: SnippetStop[] = []
    let i = from
    while (i < until) {
        const ch = template[i]
        if (ch === '\\' && i + 1 < until) {
            text += template[i + 1]
            i += 2
            continue
        }
        if (ch === '$') {
            if (template[i + 1] === '{') {
                const close = findMatchingBrace(template, i + 1, until)
                if (close < 0) { text += ch; i++; continue }
                const body = template.slice(i + 2, close)
                let k = 0
                while (k < body.length && body[k] >= '0' && body[k] <= '9') k++
                const numStr = body.slice(0, k)
                const order = Number(numStr)
                if (numStr && Number.isFinite(order)) {
                    const pos = text.length
                    if (body[k] === '|') {
                        let end = k + 1
                        while (end < body.length && body[end] !== '|') end++
                        const choices = body.slice(k + 1, end)
                        let first = choices
                        const comma = choices.indexOf(',')
                        if (comma >= 0) first = choices.slice(0, comma)
                        text += first
                        stops.push({ pos, order, len: first.length })
                    }
                    else if (body[k] === ':') {
                        const inner = parsePart(body, k + 1, body.length)
                        text += inner.text
                        for (const s of inner.stops)
                            stops.push({ pos: s.pos + pos, order: s.order, len: s.len })
                        stops.push({ pos, order, len: inner.text.length })
                    }
                    else {
                        stops.push({ pos, order, len: 0 })
                    }
                    i = close + 1
                    continue
                }
            }
            let j = i + 1
            while (j < until && template[j] >= '0' && template[j] <= '9') j++
            if (j > i + 1) {
                const order = Number(template.slice(i + 1, j))
                stops.push({ pos: text.length, order, len: 0 })
                i = j
                continue
            }
        }
        text += ch
        i++
    }
    return { text, stops }
}

/** 解析 snippet 模板 → 纯文本 + 跳位 */
export function expandSnippet(template: string): ExpandedSnippet {
    const { text, stops } = parsePart(template, 0, template.length)
    if (!stops.some(s => s.order === 0))
        stops.push({ pos: text.length, order: 0, len: 0 })
    stops.sort((a, b) => {
        const ao = a.order === 0 ? 1e9 : a.order
        const bo = b.order === 0 ? 1e9 : b.order
        return ao - bo || a.pos - b.pos
    })
    return { text, stops }
}

/**
 * Monaco SnippetSession.adjustWhitespace:多行片段第 2 行起前缀当前行缩进,
 * 行首的 \t 换成编辑器缩进单元。跳位点同步平移。
 */
export function adjustSnippetIndent(s: ExpandedSnippet, indent: string, indentUnit: string): ExpandedSnippet {
    const src = s.text
    // map[i] = 原偏移 i 在新文本里的偏移(含 i = length)
    const map = new Array<number>(src.length + 1)
    let out = ''
    let lineStart = false
    for (let i = 0; i < src.length; i++) {
        if (lineStart) {
            // 行首:先插缩进,再把连续的 \t 换成缩进单元
            out += indent
            lineStart = false
            while (i < src.length && src[i] === '\t') {
                map[i] = out.length
                out += indentUnit
                i++
            }
            if (i >= src.length) break
        }
        map[i] = out.length
        out += src[i]
        if (src[i] === '\n') lineStart = true
    }
    if (lineStart) out += indent
    map[src.length] = out.length
    // 行首位置映射到缩进之后(空占位 $0 停在缩进末尾)
    const at = (p: number) => map[p] ?? out.length
    const stops = s.stops.map((st) => {
        const pos = at(st.pos)
        const end = st.len ? at(st.pos + st.len) : pos
        return { pos, order: st.order, len: Math.max(0, end - pos) }
    })
    return { text: out, stops }
}
