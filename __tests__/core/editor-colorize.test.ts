// monaco.editor.colorize / colorizeElement / colorizeModelLine / tokenize。
// 期望串按 Monaco 的 colorizer.ts + viewLineRenderer.ts 的规则手算(nbsp = U+00A0,空行 `<span><span></span></span>`,
// 每行后接 `<br/>`;LongToken=50;控制字符/BOM 的特殊替换),不是拿实现的输出反推。
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as monaco from '../../src/index'

let n = 0
const uniq = () => `cz-lang-${++n}-${Math.random().toString(36).slice(2, 6)}`
const disposables: { dispose(): void }[] = []
afterEach(() => {
    for (const d of disposables.splice(0)) d.dispose()
    monaco.editor.setTheme('vs')
    monaco.languages.setColorMap(null)
    vi.restoreAllMocks()
})

const NB = '\u00a0'

/** 注册一个小 monarch 语言:keyword / ident / number / white / op;返回 id */
function lang(extra: Partial<monaco.languages.IMonarchLanguage> = {}): string {
    const id = uniq()
    monaco.languages.register({ id, mimetypes: [`text/x-${id}`] })
    disposables.push(monaco.languages.setMonarchTokensProvider(id, {
        tokenizer: {
            root: [
                [/\b(?:let|const)\b/, 'keyword'],
                [/[a-z_]\w*/, 'ident'],
                [/\d+/, 'number'],
                [/\s+/, 'white'],
                [/=/, 'op'],
            ],
        },
        ...extra,
    } as monaco.languages.IMonarchLanguage))
    return id
}

/** 主题:默认前景 000000(id1)、背景 ffffff(id2)、keyword 红(id3)、number 蓝(id4) */
function redTheme(): void {
    monaco.editor.defineTheme('cz-red', {
        base: 'vs', inherit: false,
        rules: [{ token: 'keyword', foreground: 'ff0000' }, { token: 'number', foreground: '0000ff' }],
        colors: {},
    })
    monaco.editor.setTheme('cz-red')
}

describe('tokenize', () => {
    it('走已注册的分词器,逐行带状态,token 类型带语言后缀', () => {
        const id = lang()
        const r = monaco.editor.tokenize('let x = 1\nb', id)
        expect(r.map(l => l.map(t => [t.offset, t.type]))).toEqual([
            [[0, `keyword.${id}`], [3, `white.${id}`], [4, `ident.${id}`], [5, `white.${id}`], [6, `op.${id}`], [7, `white.${id}`], [8, `number.${id}`]],
            [[0, `ident.${id}`]],
        ])
        expect(r[0][0].language).toBe(id)
    })
    it('没有分词器的语言:每行一个空类型 token;空串 = 一行;CRLF / CR / LF 都算换行', () => {
        const id = uniq()
        monaco.languages.register({ id })
        const r = monaco.editor.tokenize('a\r\nb\rc\nd', id)
        expect(r.length).toBe(4)
        for (const l of r) expect(l.map(t => [t.offset, t.type])).toEqual([[0, '']])
        expect(monaco.editor.tokenize('', id).length).toBe(1)
    })
    it('完全未注册的语言 id 也不抛', () => {
        expect(monaco.editor.tokenize('x', 'cz-never-registered')[0][0].type).toBe('')
    })
})

describe('colorize', () => {
    it('未注册语言:整行一个默认前景 token(mtk1),转义 < > &,tab 展开成 nbsp,行尾 <br/>', async () => {
        const html = await monaco.editor.colorize('a<b>&c\td', 'cz-unknown', { tabSize: 4 })
        // 前缀 "a<b>&c" 占 6 列,tab 补到 8 列 = 2 个 nbsp
        expect(html).toBe(`<span><span class="mtk1">a&lt;b&gt;&amp;c${NB}${NB}d</span></span><br/>`)
    })
    it('默认 tabSize = 4;多行;空行是 <span><span></span></span>;去掉 UTF-8 BOM', async () => {
        const html = await monaco.editor.colorize('\uFEFF\tx\n\n' + 'z', 'cz-unknown', {})
        expect(html).toBe(
            `<span><span class="mtk1">${NB}${NB}${NB}${NB}x</span></span><br/>` +
            `<span><span></span></span><br/>` +
            `<span><span class="mtk1">z</span></span><br/>`)
    })
    it('空格 → nbsp;NUL → &#00;;行内 BOM / LS / PS / NEL → U+FFFD', async () => {
        const html = await monaco.editor.colorize('a b\u0000c\u2028\u2029\u0085\uFEFF', 'cz-unknown', { tabSize: 4 })
        expect(html).toBe(`<span><span class="mtk1">a${NB}b&#00;c\uFFFD\uFFFD\uFFFD\uFFFD</span></span><br/>`)
    })
    it('过长 token(> 50)在纯 ASCII 下每 50 字符断一段', async () => {
        const html = await monaco.editor.colorize('a'.repeat(120), 'cz-unknown', {})
        expect(html).toBe(
            `<span><span class="mtk1">${'a'.repeat(50)}</span><span class="mtk1">${'a'.repeat(50)}</span><span class="mtk1">${'a'.repeat(20)}</span></span><br/>`)
    })
    it('过长 token 含非 ASCII:只在空格处断', async () => {
        const text = ('é' + ' ').repeat(40).trimEnd() // 79 字符,非 ASCII
        const html = await monaco.editor.colorize(text, 'cz-unknown', {})
        const parts = [...html.matchAll(/<span class="mtk1">([^<]*)<\/span>/g)].map(m => m[1])
        expect(parts.length).toBeGreaterThan(1)
        expect(parts.join('')).toBe(text.replace(/ /g, NB))
        for (const p of parts.slice(0, -1)) expect(p.endsWith(NB)).toBe(true)
    })
    it('含 RTL 字符的行:token 加 dir="rtl" 与 unicode-bidi 隔离', async () => {
        const html = await monaco.editor.colorize('אב', 'cz-unknown', {})
        expect(html).toBe(`<span><span dir="rtl" style="unicode-bidi:isolate" class="mtk1">אב</span></span><br/>`)
    })
    it('已注册 monarch 语言:按主题颜色编号出 mtkN,相同 metadata 的相邻 token 合并;并把 .mtkN 颜色规则写进文档', async () => {
        redTheme()
        const id = lang()
        const html = await monaco.editor.colorize('let x = 1', id, {})
        expect(html).toBe(
            `<span><span class="mtk3">let</span><span class="mtk1">${NB}x${NB}=${NB}</span><span class="mtk4">1</span></span><br/>`)
        const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')
        expect(css).toContain('.mtk3 { color: #ff0000; }')
        expect(css).toContain('.mtk4 { color: #0000ff; }')
    })
    it('字体样式进类名(italic → mtki)', async () => {
        monaco.editor.defineTheme('cz-it', { base: 'vs', inherit: false, rules: [{ token: 'keyword', foreground: 'ff0000', fontStyle: 'italic bold' }], colors: {} })
        monaco.editor.setTheme('cz-it')
        const id = lang()
        const html = await monaco.editor.colorize('let', id, {})
        expect(html).toBe(`<span><span class="mtk3 mtki mtkb">let</span></span><br/>`)
    })
    it('setColorMap 之后 colorize 用覆盖的颜色表', async () => {
        const id = lang()
        monaco.languages.setColorMap([null as unknown as string, '#111111', '#222222', '#333333'])
        const html = await monaco.editor.colorize('let', id, {})
        const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')
        expect(html).toContain('class="mtk')
        expect(css).toContain('.mtk3 { color: #333333; }')
    })
    it('懒工厂语言:colorize 等到分词器就绪再出结果', async () => {
        redTheme()
        const id = uniq()
        monaco.languages.register({ id })
        disposables.push(monaco.languages.registerTokensProviderFactory(id, {
            create: () => new Promise(r => setTimeout(() => r({ tokenizer: { root: [[/let/, 'keyword']] } }), 5)),
        }))
        const html = await monaco.editor.colorize('let', id, {})
        expect(html).toBe(`<span><span class="mtk3">let</span></span><br/>`)
    })
})

describe('colorizeElement', () => {
    it('用 data-lang 取语言,默认主题 vs:类名追加主题名,innerHTML 换成着色结果', async () => {
        const id = lang()
        const el = document.createElement('pre')
        el.setAttribute('data-lang', id)
        el.className = 'code'
        el.textContent = 'let x'
        await monaco.editor.colorizeElement(el, {})
        expect(el.className).toBe('code vs')
        expect(el.querySelector('span span')).not.toBeNull()
        expect(el.textContent).toBe(`let${NB}x`)
        expect(el.innerHTML.endsWith('<br>')).toBe(true)
    })
    it('lang 属性、mimeType 选项(经 getLanguageIdByMimeType 翻译)、theme 选项', async () => {
        redTheme()
        const id = lang()
        const a = document.createElement('div'); a.setAttribute('lang', id); a.textContent = 'let'
        await monaco.editor.colorizeElement(a, { theme: 'cz-red' })
        expect(a.className).toBe(' cz-red')
        expect(a.innerHTML).toContain('class="mtk3"')
        const b = document.createElement('div'); b.textContent = 'let'
        await monaco.editor.colorizeElement(b, { mimeType: `text/x-${id}`, theme: 'cz-red' })
        expect(b.innerHTML).toContain('class="mtk3"')
    })
    it('没有语言信息:console.error("Mode not detected"),不改节点', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => { })
        const el = document.createElement('div'); el.textContent = 'let'
        await monaco.editor.colorizeElement(el, {})
        expect(err).toHaveBeenCalledWith('Mode not detected')
        expect(el.innerHTML).toBe('let')
    })
    it('没有文本节点:当空串处理', async () => {
        const el = document.createElement('div'); el.setAttribute('data-lang', 'cz-unknown')
        await monaco.editor.colorizeElement(el, {})
        expect(el.innerHTML).toBe('<span><span></span></span><br>')
    })
})

describe('colorizeModelLine', () => {
    it('取 model 的某一行 token 渲染成 html,行尾不带 <br/>', () => {
        redTheme()
        const id = lang()
        const m = monaco.editor.createModel('let x\nconst 7', id)
        disposables.push(m)
        expect(monaco.editor.colorizeModelLine(m, 1)).toBe(`<span><span class="mtk3">let</span><span class="mtk1">${NB}x</span></span>`)
        expect(monaco.editor.colorizeModelLine(m, 2)).toBe(`<span><span class="mtk3">const</span><span class="mtk1">${NB}</span><span class="mtk4">7</span></span>`)
    })
    it('tabSize 参数生效(默认 4);无分词器的语言整行默认色', () => {
        const id = uniq(); monaco.languages.register({ id })
        const m = monaco.editor.createModel('a\tb', id); disposables.push(m)
        expect(monaco.editor.colorizeModelLine(m, 1)).toBe(`<span><span class="mtk1">a${NB}${NB}${NB}b</span></span>`)
        expect(monaco.editor.colorizeModelLine(m, 1, 2)).toBe(`<span><span class="mtk1">a${NB}b</span></span>`)
    })
    it('空行', () => {
        const id = uniq(); monaco.languages.register({ id })
        const m = monaco.editor.createModel('a\n', id); disposables.push(m)
        expect(monaco.editor.colorizeModelLine(m, 2)).toBe('<span><span></span></span>')
    })
})
