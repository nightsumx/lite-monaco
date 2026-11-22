// 小而正确的 markdown 子集 → 安全 DOM(hover JSDoc / 签名文档用)。
//
// 支持:段落、硬换行(行尾两空格 / 反斜杠)、# 标题、``` / ~~~ 代码块(可选高亮回调)、缩进代码块、
// - * + / 1. 列表(按缩进嵌套)、> 引用、--- 分隔线;行内 `code`、**粗** / __粗__、*斜* / _斜_、
// ~~删除~~、[文字](链接)、<http://自动链接>、\ 转义。
//
// 安全:只用 createElement + textContent 拼 DOM,从不 innerHTML;原文里的 HTML 标签按纯文本显示。
// 链接只放行 http(s) / mailto,其它协议(javascript: / data: …)降级为纯文本。

export interface MarkdownOptions {
    /** 代码块高亮:返回装好 token 的元素(放进 <code>);null → 纯文本 */
    highlight?: (code: string, lang: string) => HTMLElement | null
}

const SAFE_URL = /^(https?:|mailto:)/i

export function safeHref(url: string): string | null {
    const u = url.trim()
    return SAFE_URL.test(u) ? u : null
}

/** 整段 markdown → 容器元素(div.cm-md) */
export function renderMarkdown(src: string, opts: MarkdownOptions = {}): HTMLElement {
    const root = document.createElement('div')
    root.className = 'cm-md'
    renderBlocks(root, src.replace(/\r\n?/g, '\n').split('\n'), opts)
    return root
}

/** 只渲行内(标签行等不要段落外壳的地方) */
export function renderInlineMarkdown(target: HTMLElement, src: string): void {
    appendInline(target, src)
}

interface ListItem { indent: number, ordered: boolean, start: number, text: string[] }

function renderBlocks(parent: HTMLElement, lines: string[], opts: MarkdownOptions): void {
    let i = 0
    let para: string[] = []
    const flushPara = () => {
        if (!para.length) return
        const p = document.createElement('p')
        appendParagraph(p, para)
        parent.appendChild(p)
        para = []
    }
    while (i < lines.length) {
        const line = lines[i]
        // 代码块围栏
        const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
        if (fence) {
            flushPara()
            const mark = fence[1]
            const lang = fence[2] ?? ''
            const body: string[] = []
            i++
            while (i < lines.length && !new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`).test(lines[i])) {
                body.push(lines[i])
                i++
            }
            i++ // 跳过闭合围栏(没有闭合 → 吃到结尾)
            parent.appendChild(codeBlock(body.join('\n'), lang, opts))
            continue
        }
        if (!line.trim()) { flushPara(); i++; continue }
        // 分隔线
        if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
            flushPara()
            parent.appendChild(document.createElement('hr'))
            i++
            continue
        }
        // 标题
        const h = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
        if (h) {
            flushPara()
            const el = document.createElement(`h${h[1].length}`)
            appendInline(el, h[2])
            parent.appendChild(el)
            i++
            continue
        }
        // 缩进代码块(段落中间的缩进行不算)
        if (!para.length && /^( {4}|\t)/.test(line)) {
            const body: string[] = []
            while (i < lines.length && (/^( {4}|\t)/.test(lines[i]) || !lines[i].trim())) {
                body.push(lines[i].replace(/^( {4}|\t)/, ''))
                i++
            }
            while (body.length && !body[body.length - 1].trim()) body.pop()
            parent.appendChild(codeBlock(body.join('\n'), '', opts))
            continue
        }
        // 引用
        if (/^ {0,3}>/.test(line)) {
            flushPara()
            const body: string[] = []
            while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
                body.push(lines[i].replace(/^ {0,3}> ?/, ''))
                i++
            }
            const q = document.createElement('blockquote')
            renderBlocks(q, body, opts)
            parent.appendChild(q)
            continue
        }
        // 列表
        if (listMarker(line)) {
            flushPara()
            i = renderList(parent, lines, i, opts)
            continue
        }
        para.push(line)
        i++
    }
    flushPara()
}

function listMarker(line: string): { indent: number, ordered: boolean, start: number, rest: string } | null {
    const m = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/.exec(line)
    if (!m) return null
    // `---` / `***` 是分隔线不是列表
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) return null
    return { indent: m[1].replace(/\t/g, '    ').length, ordered: m[3] != null, start: m[3] != null ? Number(m[3]) : 1, rest: m[4] }
}

function renderList(parent: HTMLElement, lines: string[], i: number, opts: MarkdownOptions): number {
    const first = listMarker(lines[i])!
    const items: ListItem[] = []
    while (i < lines.length) {
        const mk = listMarker(lines[i])
        if (mk && mk.indent <= first.indent + 1) {
            if (mk.ordered !== first.ordered) break
            items.push({ indent: mk.indent, ordered: mk.ordered, start: mk.start, text: [mk.rest] })
            i++
            continue
        }
        const line = lines[i]
        if (!line.trim()) {
            // 空行后接着缩进内容 → 仍属当前项;否则列表结束
            const next = lines[i + 1]
            if (next != null && (/^\s{2,}/.test(next) || (listMarker(next)?.indent ?? -1) > first.indent + 1)) {
                items[items.length - 1].text.push('')
                i++
                continue
            }
            break
        }
        // 续行 / 嵌套:缩进比标记深,或懒续行(非块起始)
        if (/^\s+/.test(line) || !isBlockStart(line)) {
            items[items.length - 1].text.push(line.replace(/^\s{1,4}/, ''))
            i++
            continue
        }
        break
    }
    const list = document.createElement(first.ordered ? 'ol' : 'ul')
    if (first.ordered && first.start !== 1) list.setAttribute('start', String(first.start))
    for (const it of items) {
        const li = document.createElement('li')
        const body = it.text
        // 单段纯文本项不包 <p>(紧凑列表)
        if (body.length === 1 || body.every(l => l.trim() && !isBlockStart(l))) appendParagraph(li, body)
        else renderBlocks(li, body, opts)
        list.appendChild(li)
    }
    parent.appendChild(list)
    return i
}

function isBlockStart(line: string): boolean {
    return /^ {0,3}(`{3,}|~{3,}|#{1,6}\s|>)/.test(line) || listMarker(line) != null
}

function codeBlock(code: string, lang: string, opts: MarkdownOptions): HTMLElement {
    const pre = document.createElement('pre')
    pre.className = 'cm-md-code'
    const el = document.createElement('code')
    if (lang) el.dataset.lang = lang
    let hl: HTMLElement | null = null
    try { hl = opts.highlight?.(code, lang || 'typescript') ?? null } catch { hl = null }
    if (hl) el.appendChild(hl)
    else el.textContent = code
    pre.appendChild(el)
    return pre
}

/** 段落:行间软换行变空格;行尾两空格或反斜杠 → <br> */
function appendParagraph(target: HTMLElement, lines: string[]): void {
    lines.forEach((raw, k) => {
        const last = k === lines.length - 1
        let line = raw.replace(/^\s+/, '')
        let hard = false
        if (!last && / {2,}$/.test(line)) { hard = true; line = line.replace(/ +$/, '') }
        else if (!last && /\\$/.test(line)) { hard = true; line = line.slice(0, -1) }
        else line = line.replace(/\s+$/, '')
        appendInline(target, line)
        if (!last) target.appendChild(hard ? document.createElement('br') : document.createTextNode(' '))
    })
}

const PUNCT = /[!-/:-@[-`{-~]/

/** 行内:逐字符扫描,遇到结构标记就找配对;找不到配对按字面输出 */
function appendInline(target: HTMLElement, src: string): void {
    let text = ''
    const flush = () => { if (text) { target.appendChild(document.createTextNode(text)); text = '' } }
    let i = 0
    while (i < src.length) {
        const ch = src[i]
        // 转义
        if (ch === '\\' && i + 1 < src.length && PUNCT.test(src[i + 1])) {
            text += src[i + 1]
            i += 2
            continue
        }
        // 行内代码:N 个反引号配 N 个
        if (ch === '`') {
            let n = 1
            while (src[i + n] === '`') n++
            const tick = '`'.repeat(n)
            const close = findTicks(src, i + n, n)
            if (close >= 0) {
                flush()
                const code = document.createElement('code')
                let body = src.slice(i + n, close)
                if (body.length > 1 && body.startsWith(' ') && body.endsWith(' ') && body.trim()) body = body.slice(1, -1)
                code.textContent = body
                target.appendChild(code)
                i = close + n
                continue
            }
            text += tick
            i += n
            continue
        }
        // 自动链接 <http://…>
        if (ch === '<') {
            const m = /^<((?:https?:|mailto:)[^\s<>]+)>/i.exec(src.slice(i))
            if (m) {
                flush()
                target.appendChild(link(m[1], m[1]))
                i += m[0].length
                continue
            }
        }
        // [文字](链接)
        if (ch === '[') {
            const end = matchBracket(src, i)
            if (end > 0 && src[end + 1] === '(') {
                const close = src.indexOf(')', end + 2)
                if (close > 0) {
                    const label = src.slice(i + 1, end)
                    const url = src.slice(end + 2, close).trim().split(/\s+/)[0] ?? ''
                    flush()
                    const href = safeHref(url)
                    if (href) {
                        const a = link(href, '')
                        appendInline(a, label)
                        target.appendChild(a)
                    } else {
                        appendInline(target, label)
                    }
                    i = close + 1
                    continue
                }
            }
        }
        // **粗** / __粗__ / *斜* / _斜_ / ~~删~~
        if (ch === '*' || ch === '_' || ch === '~') {
            let n = 1
            while (src[i + n] === ch) n++
            if (ch === '~' && n < 2) { text += ch; i++; continue }
            const run = Math.min(n, ch === '~' ? 2 : 3)
            const after = src[i + run]
            const before = i > 0 ? src[i - 1] : ' '
            // 词内下划线不算强调(snake_case);开标记后面不能是空白
            const opener = after != null && !/\s/.test(after) && !(ch === '_' && /\w/.test(before))
            if (opener) {
                const close = findCloser(src, i + run, ch, run)
                if (close > 0) {
                    flush()
                    const inner = src.slice(i + run, close)
                    let el: HTMLElement
                    if (ch === '~') el = document.createElement('del')
                    else if (run === 3) { el = document.createElement('strong'); const em = document.createElement('em'); el.appendChild(em); appendInline(em, inner); target.appendChild(el); i = close + run; continue }
                    else el = document.createElement(run === 2 ? 'strong' : 'em')
                    appendInline(el, inner)
                    target.appendChild(el)
                    i = close + run
                    continue
                }
            }
            text += src.slice(i, i + n)
            i += n
            continue
        }
        text += ch
        i++
    }
    flush()
}

function findTicks(src: string, from: number, n: number): number {
    for (let j = from; j < src.length; j++) {
        if (src[j] !== '`') continue
        let k = 0
        while (src[j + k] === '`') k++
        if (k === n) return j
        j += k - 1
    }
    return -1
}

function matchBracket(src: string, open: number): number {
    let depth = 0
    for (let j = open; j < src.length; j++) {
        const c = src[j]
        if (c === '\\') { j++; continue }
        if (c === '`') { const n = findTicks(src, j + 1, 1); if (n > 0) { j = n; continue } }
        if (c === '[') depth++
        else if (c === ']' && --depth === 0) return j
    }
    return -1
}

/** 找强调的闭合:同字符同长度,前面不是空白,跳过行内代码 */
function findCloser(src: string, from: number, ch: string, run: number): number {
    for (let j = from; j < src.length; j++) {
        const c = src[j]
        if (c === '\\') { j++; continue }
        if (c === '`') {
            let n = 1
            while (src[j + n] === '`') n++
            const close = findTicks(src, j + n, n)
            if (close > 0) { j = close + n - 1; continue }
        }
        if (c !== ch) continue
        let k = 0
        while (src[j + k] === ch) k++
        if (k >= run && j > from && !/\s/.test(src[j - 1])) {
            const after = src[j + run]
            if (ch === '_' && after != null && /\w/.test(after)) { j += k - 1; continue }
            return j
        }
        j += k - 1
    }
    return -1
}

function link(href: string, text: string): HTMLAnchorElement {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    if (text) a.textContent = text
    return a
}

/** shiki 高亮器 → 代码块高亮回调(语言没加载就退纯文本) */
export function shikiCodeHighlighter(
    hl: import('../core/view/tokens').ScopedShiki,
    theme: string,
): (code: string, lang: string) => HTMLElement | null {
    const alias: Record<string, string> = { ts: 'typescript', js: 'javascript', tsx: 'tsx', jsx: 'jsx', sh: 'bash', shell: 'bash' }
    return (code, lang) => {
        const l = (alias[lang.toLowerCase()] ?? lang.toLowerCase()) || 'typescript'
        const loaded = hl.getLoadedLanguages?.()
        if (loaded && !loaded.includes(l)) return null
        const { tokens } = hl.codeToTokens(code, { lang: l, theme })
        const frag = document.createElement('span')
        tokens.forEach((line, n) => {
            if (n) frag.appendChild(document.createTextNode('\n'))
            for (const t of line) {
                const span = document.createElement('span')
                if (t.color) span.style.color = t.color
                span.textContent = t.content
                frag.appendChild(span)
            }
        })
        return frag
    }
}
