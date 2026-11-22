// 官网里的每一个编辑器都是真的 lite-monaco:直接 import 源码,不是截图。
import * as monaco from '../src/index'
import { setDefaultHighlighter } from '../src/index'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import vesper from 'shiki/themes/vesper.mjs'
import langTs from 'shiki/langs/typescript.mjs'
import langJson from 'shiki/langs/json.mjs'
import langCss from 'shiki/langs/css.mjs'
// 构建时从 PARITY.md 解析(build.mjs 的 virtual:parity),总数对不上构建直接失败
import parity from 'virtual:parity'

type Editor = monaco.editor.IStandaloneCodeEditor
type Model = monaco.editor.ITextModel

const THEME = 'vesper'
const FONT = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const K = { mod: isMac ? '⌘' : 'Ctrl', alt: isMac ? '⌥' : 'Alt', shift: isMac ? '⇧' : 'Shift' }
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (id: string) => document.getElementById(id)!
const raf = () => new Promise<number>(r => requestAnimationFrame(r))
const fmt = (n: number) => n.toLocaleString('en-US')

document.documentElement.classList.remove('no-js')

// ───────────────────────── 页面骨架:入场、计数、复制 ─────────────────────────

function countUp(el: HTMLElement) {
    const to = Number(el.dataset.count)
    if (reduceMotion || !to) return
    const t0 = performance.now(), dur = 1100
    const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur)
        const v = Math.round(to * (1 - Math.pow(1 - p, 3)))
        el.textContent = 'plain' in el.dataset ? String(v) : fmt(v)
        if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
}

const revealIO = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting) return
        e.target.classList.add('in')
        e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp)
        revealIO!.unobserve(e.target)
    }), { rootMargin: '0px 0px -10% 0px' })
    : null
document.querySelectorAll('.reveal').forEach(el => revealIO ? revealIO.observe(el) : el.classList.add('in'))

$('copy').addEventListener('click', async e => {
    const b = e.currentTarget as HTMLButtonElement
    try { await navigator.clipboard.writeText('npm i lite-monaco shiki'); b.textContent = '已复制' } catch { b.textContent = '请手动复制' }
    setTimeout(() => { b.textContent = '复制' }, 1600)
})

// hero 背景网格跟着指针
{
    const hero = $('hero')
    let pending = false, x = 0, y = 0
    hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect()
        x = e.clientX - r.left; y = e.clientY - r.top
        if (pending) return
        pending = true
        requestAnimationFrame(() => { pending = false; hero.style.setProperty('--mx', x + 'px'); hero.style.setProperty('--my', y + 'px') })
    })
}

// 81 种语言:随机亮几个
{
    const wall = $('lang-wall')
    const spans = wall.textContent!.trim().split(/\s+/).map(w => { const s = document.createElement('span'); s.textContent = w; return s })
    wall.textContent = ''
    spans.forEach((s, i) => { if (i) wall.append(' '); wall.append(s) })
    if (!reduceMotion) setInterval(() => {
        if (document.hidden) return
        spans.forEach(s => s.classList.remove('on'))
        for (let i = 0; i < 4; i++) spans[(Math.random() * spans.length) | 0].classList.add('on')
    }, 900)
}

// ───────────────────────── 单测点阵(canvas) ─────────────────────────

type Dot = { file: number }
function drawMatrix() {
    const cv = $('matrix-cv') as HTMLCanvasElement
    const tip = $('matrix-tip')
    const ctx = cv.getContext('2d')!
    const files = parity.files
    const COLORS: Record<string, string> = { A: '#ff5a1f', B: '#ffc799', C: '#d9d3c7' }
    const dots: Dot[] = []
    files.forEach((f, i) => { for (let k = 0; k < f.total; k++) dots.push({ file: i }) })

    const legend = $('legend')
    const groups = [
        { k: 'A', name: '编辑行为' }, { k: 'B', name: '查找 / 折叠 / 提示' }, { k: 'C', name: '纯算法 / 配置' }, { k: 'NA', name: '不适用（每条写了理由）' },
    ]
    legend.innerHTML = groups.map(g => {
        const n = files.filter(f => f.group === g.k).reduce((a, f) => a + f.total, 0)
        const sw = g.k === 'NA' ? 'border:1px solid #5a564f' : `background:${COLORS[g.k]}`
        return `<li><i style="${sw}"></i>${g.name} <b>${fmt(n)}</b></li>`
    }).join('')

    let cell = 9, cols = 1, progress = reduceMotion ? 1 : 0, hover = -1
    function layout() {
        const w = cv.parentElement!.clientWidth
        cell = w < 600 ? 7 : 9
        cols = Math.max(20, Math.floor(w / cell))
        const rows = Math.ceil(dots.length / cols)
        const dpr = Math.min(2, devicePixelRatio || 1)
        cv.width = Math.round(cols * cell * dpr); cv.height = Math.round(rows * cell * dpr)
        cv.style.width = cols * cell + 'px'; cv.style.height = rows * cell + 'px'
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        paint()
    }
    function paint() {
        ctx.clearRect(0, 0, cv.width, cv.height)
        const shown = Math.floor(dots.length * progress)
        const s = cell - 3
        for (let i = 0; i < shown; i++) {
            const f = files[dots[i].file]
            const x = (i % cols) * cell, y = Math.floor(i / cols) * cell
            const hot = hover === dots[i].file
            const edge = progress < 1 && i > shown - cols * 2
            if (f.group === 'NA') {
                ctx.strokeStyle = hot ? '#ece7dd' : '#4a4640'
                ctx.lineWidth = 1
                ctx.strokeRect(x + .5, y + .5, s - 1, s - 1)
            } else {
                ctx.fillStyle = hot || edge ? '#ffffff' : COLORS[f.group]
                ctx.globalAlpha = hover >= 0 && !hot ? .45 : 1
                ctx.fillRect(x, y, s, s)
                ctx.globalAlpha = 1
            }
        }
    }
    const io = new IntersectionObserver(es => {
        if (!es[0].isIntersecting) return
        io.disconnect()
        if (progress >= 1) return
        const t0 = performance.now(), dur = 1600
        const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / dur)
            progress = 1 - Math.pow(1 - p, 2)
            paint()
            if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
    }, { rootMargin: '0px 0px -15% 0px' })
    io.observe(cv)

    cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect()
        const cx = Math.floor((e.clientX - r.left) / cell), cy = Math.floor((e.clientY - r.top) / cell)
        const i = cy * cols + cx
        const fi = cx >= 0 && cx < cols && i >= 0 && i < dots.length ? dots[i].file : -1
        if (fi !== hover) { hover = fi; paint() }
        if (fi < 0) { tip.hidden = true; return }
        const f = files[fi]
        tip.innerHTML = `<b>${esc(f.file)}</b>` + (f.group === 'NA'
            ? `不适用 · ${f.total} 条<br>${esc(f.reason.length > 150 ? f.reason.slice(0, 150) + '…' : f.reason)}`
            : `<span class="ok">${f.pass}/${f.total} 通过</span>`)
        tip.hidden = false
        const tw = tip.offsetWidth, th = tip.offsetHeight
        let lx = e.clientX - r.left + 14, ly = e.clientY - r.top + 14
        if (lx + tw > r.width) lx = e.clientX - r.left - tw - 14
        if (ly + th > r.height + 40) ly = e.clientY - r.top - th - 14
        tip.style.left = Math.max(0, lx) + 'px'; tip.style.top = ly + 'px'
    })
    cv.addEventListener('pointerleave', () => { hover = -1; tip.hidden = true; paint() })
    new ResizeObserver(layout).observe(cv.parentElement!)
    layout()
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
drawMatrix()

// ───────────────────────── 示例文档 ─────────────────────────

const TS_DOC = `// 这是一个真的编辑器。点进来，脚本就停，换你来。
type Listener<T> = (value: T) => void

export class Emitter<T> {
  private listeners = new Set<Listener<T>>()

  on(fn: Listener<T>): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(value: T): void {
    for (const fn of this.listeners) fn(value)
  }
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

const changes = new Emitter<string>()
const off = changes.on(text => console.log(\`changed: \${text.length} chars\`))
changes.emit('hello')
off()
`

const JSON_DOC = `{
  "name": "demo-app",
  "version": "1.0.0",
  "private": "yes",
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  },
  "license": "MIT",
  "engines": {
    "node": ">=20"
  }
}
`

const JSON_SCHEMA = {
    type: 'object',
    required: ['name', 'version'],
    properties: {
        name: { type: 'string', description: '包名。' },
        version: { type: 'string', description: '语义化版本号。' },
        private: { type: 'boolean', description: '为 true 时 npm 拒绝发布。' },
        license: { type: 'string', description: '许可证标识。', enum: ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause'] },
        scripts: { type: 'object', description: '脚本表。', additionalProperties: { type: 'string' } },
        engines: { type: 'object', properties: { node: { type: 'string' } } },
    },
}

const CSS_DOC = `/* 光标放在 gap: 后面，按 Ctrl+Space 看补全和 MDN 文档。 */
:root {
  --bg: #0a0a0a;
  --text: #ece7dd;
  --signal: #ff5a1f;
}

.bench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 0;
  color: var(--text);
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  border: 1px solid rgb(236 231 221 / .16);
}

@media (max-width: 980px) {
  .bench { grid-template-columns: 1fr; }
}
`

const MIG_BEFORE = `import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

monaco.editor.create(el, {
  value: 'const hello = "world"\\n',
  language: 'typescript',
  theme: 'vs-dark',
})
`
const MIG_AFTER = `import * as monaco from 'lite-monaco'

monaco.editor.create(el, {
  value: 'const hello = "world"\\n',
  language: 'typescript',
  theme: 'vs-dark',
})
`

function bigDoc(lines: number): string {
    const out = new Array<string>(lines)
    for (let i = 0; i < lines; i++) {
        const k = i % 8
        out[i] = k === 0 ? `export function task${i}(input: number): number {`
            : k === 1 ? `  const base = input * ${i} + ${i % 97}`
            : k === 2 ? `  if (base % 2 === 0) {`
            : k === 3 ? `    return base / 2 // line ${i + 1}`
            : k === 4 ? `  }`
            : k === 5 ? `  return base * 3 + 1`
            : k === 6 ? `}`
            : ``
    }
    return out.join('\n')
}

// ───────────────────────── 计时:按键 → model → 下一帧 ─────────────────────────

/** 输入发生的时刻:用户的按键/粘贴在捕获阶段记下,脚本在 trigger 前记下;model 变了就算一次 */
function meter(ed: Editor, root: HTMLElement, out: (sync: number, frame: number) => void) {
    let t0 = 0
    const mark = () => { t0 = performance.now() }
    for (const ev of ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'compositionend']) root.addEventListener(ev, mark, true)
    ed.onDidChangeModelContent(e => {
        if (!t0 || e.isFlush) return
        const start = t0; t0 = 0
        const sync = performance.now() - start
        requestAnimationFrame(() => out(sync, performance.now() - start))
    })
    return mark
}

function flash(el: HTMLElement, text: string) {
    if (el.textContent === text) return
    el.textContent = text
    el.classList.add('flash')
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('flash')))
}

const sleep = (ms: number, alive: () => boolean) => new Promise<boolean>(r => setTimeout(() => r(alive()), reduceMotion ? 0 : ms))

// ───────────────────────── 主体 ─────────────────────────

async function main() {
    const hl = await createHighlighterCore({ themes: [vesper], langs: [langTs, langJson, langCss], engine: createJavaScriptRegexEngine() })
    setDefaultHighlighter(hl as never)
    await document.fonts.load("16px 'Geist Mono'").catch(() => {})

    initHero()
    const bench = initBench()
    initMigration()
    ;(window as unknown as Record<string, unknown>).__site = { monaco, ...bench }
}

// ── hero:一个大字号的真编辑器,脚本把 'monaco-editor' 改成 'lite-monaco' ──
function initHero() {
    const host = $('hero-ed')
    const LINE1 = '// 从 monaco-editor 迁过来，只改这一行：'
    const LINE2 = "import * as monaco from 'monaco-editor'"
    const model = monaco.editor.createModel(LINE1 + '\n' + LINE2, 'typescript')
    const sizeFor = (w: number) => Math.max(14, Math.min(54, Math.floor(w / 24.4)))
    let fs = sizeFor(host.clientWidth)
    const lh = (s: number) => Math.round(s * 1.42)
    const ed = monaco.editor.create(host, {
        model, theme: THEME, fontFamily: FONT, fontSize: fs, lineHeight: lh(fs), letterSpacing: -0.5,
        lineNumbers: 'off', folding: false, glyphMargin: false, lineDecorationsWidth: 0, lineNumbersMinChars: 0,
        minimap: { enabled: false }, scrollbar: { vertical: 'hidden', horizontal: 'hidden', handleMouseWheel: false, alwaysConsumeMouseWheel: false },
        overviewRulerLanes: 0, overviewRulerBorder: false, hideCursorInOverviewRuler: true, renderLineHighlight: 'none',
        scrollBeyondLastLine: false, wordWrap: 'off', padding: { top: 0, bottom: 0 }, guides: { indentation: false },
        occurrencesHighlight: 'off', selectionHighlight: false, matchBrackets: 'never', cursorWidth: 3, cursorBlinking: 'phase',
        contextmenu: false, stickyScroll: { enabled: false }, automaticLayout: false, fixedOverflowWidgets: true,
        ariaLabel: '可编辑的示例代码',
    } as never) as Editor
    const fit = () => {
        const next = sizeFor(host.clientWidth)
        if (next !== fs) { fs = next; ed.updateOptions({ fontSize: fs, lineHeight: lh(fs) } as never) }
        host.style.height = lh(fs) * Math.max(2, model.getLineCount()) + 'px'
        ed.layout()
    }
    fit()
    new ResizeObserver(fit).observe(host)
    model.onDidChangeContent(() => fit())
    $('h-font').textContent = String(fs)
    ed.onDidChangeConfiguration(() => { $('h-font').textContent = String(fs) })
    ed.onDidChangeCursorPosition(e => { $('h-pos').textContent = `${e.position.lineNumber}:${e.position.column}` })
    const mark = meter(ed, host, (s, f) => { flash($('h-sync'), s.toFixed(2)); flash($('h-frame'), f.toFixed(1)) })

    let alive = true
    const stop = () => { alive = false }
    host.addEventListener('pointerdown', stop, true)
    host.addEventListener('keydown', stop, true)
    const run = async () => {
        if (!await sleep(1100, () => alive)) return
        const col = LINE2.indexOf("'") + 2
        ed.setSelection(new monaco.Selection(2, col, 2, col + 'monaco-editor'.length))
        if (!await sleep(650, () => alive)) return
        for (const ch of 'lite-monaco') {
            mark()
            ed.trigger('keyboard', 'type', { text: ch })
            if (!await sleep(85 + Math.random() * 60, () => alive)) return
        }
    }
    void run()
}

// ── 01 现场:一个编辑器,四个 model;自动演示由脚本驱动,一碰就停 ──
function initBench() {
    const host = $('play-ed')
    const benchEl = host.closest('.bench') as HTMLElement
    const models: Record<string, Model> = {
        demo: monaco.editor.createModel(TS_DOC, 'typescript'),
        json: monaco.editor.createModel(JSON_DOC, 'json', monaco.Uri.parse('inmemory://demo/package.json')),
        css: monaco.editor.createModel(CSS_DOC, 'css'),
    }
    monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions?.({
        validate: true,
        schemas: [{ uri: 'inmemory://schema/package.json', fileMatch: ['inmemory://demo/package.json'], schema: JSON_SCHEMA }],
    })
    const ed = monaco.editor.create(host, {
        model: models.demo, theme: THEME, automaticLayout: true, fontFamily: FONT, fontSize: 14, lineHeight: 22,
        minimap: { enabled: true, renderCharacters: false }, scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 }, tabSize: 2,
        bracketPairColorization: { enabled: true }, smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on',
        fixedOverflowWidgets: true,
    } as never) as Editor

    // ── HUD ──
    const H = { cursors: $('m-cursors'), sync: $('m-sync'), frame: $('m-frame'), lines: $('m-lines'), vis: $('m-vis'), dom: $('m-dom'), ver: $('m-ver') }
    let hudQueued = false
    const hud = () => {
        if (hudQueued) return
        hudQueued = true
        requestAnimationFrame(() => {
            hudQueued = false
            const m = ed.getModel()
            if (!m) return
            flash(H.cursors, String(ed.getSelections()?.length ?? 1))
            H.lines.textContent = fmt(m.getLineCount())
            H.vis.textContent = fmt(host.querySelectorAll('.cm-line').length)
            H.dom.textContent = fmt(host.querySelectorAll('*').length)
            H.ver.textContent = fmt(m.getVersionId())
        })
    }
    ed.onDidChangeCursorSelection(hud)
    ed.onDidChangeModelContent(hud)
    ed.onDidScrollChange(hud)
    ed.onDidChangeModel(hud)
    const mark = meter(ed, host, (s, f) => { flash(H.sync, s.toFixed(2)); flash(H.frame, f.toFixed(1)) })
    hud()

    // ── 字幕 ──
    const cap = $('caption'), capKeys = $('cap-keys'), capText = $('cap-text')
    const say = (keys: string[], text: string) => {
        capKeys.innerHTML = keys.map(k => `<kbd>${esc(k)}</kbd>`).join('')
        capText.textContent = text
        cap.classList.remove('step'); void cap.offsetWidth; cap.classList.add('step')
    }

    // ── 自动演示 ──
    let token = 0
    let visible = false
    const vio = new IntersectionObserver(es => { visible = es[0].isIntersecting }, { threshold: .35 })
    vio.observe(host)
    const waitVisible = async (my: number) => { while (my === token && (!visible || document.hidden)) await new Promise(r => setTimeout(r, 250)) }
    const tour = async () => {
        const my = ++token
        const ok = () => my === token
        const pause = async (ms: number) => { await waitVisible(my); return sleep(ms, ok) }
        const m = models.demo
        const type = async (text: string, gap = 70) => {
            for (const ch of text) { await waitVisible(my); if (!ok()) return false; mark(); ed.trigger('keyboard', 'type', { text: ch }); if (!await sleep(gap + Math.random() * 40, ok)) return false }
            return true
        }
        const act = (id: string) => { mark(); ed.trigger('demo', id, null) }
        benchEl.classList.add('autoplay')
        while (ok()) {
            if (ed.getModel() !== m) return
            m.setValue(TS_DOC)
            ed.setScrollTop(0)
            ed.setPosition({ lineNumber: 1, column: 1 })
            say([], '自动演示开始。点一下编辑器，脚本就停。')
            if (!await pause(1600)) return

            // 1. ⌘D 选中下一个相同的词
            const first = m.findMatches('listeners', false, false, true, null, false)[0]
            ed.setSelection(first.range)
            say([], '选中一个词')
            if (!await pause(800)) return
            for (let i = 1; i <= 3; i++) {
                say([K.mod, 'D'], `选中下一个相同的词（${i}/3）`)
                act('editor.action.addSelectionToNextFindMatch')
                if (!await pause(650)) return
            }
            // 2. 四个光标同时输入
            say([], '四个光标，同时输入')
            if (!await type('subscribers')) return
            if (!await pause(900)) return
            act('removeSecondaryCursors')

            // 3. ⌥↓ 移动行
            ed.setPosition({ lineNumber: 2, column: 1 })
            for (let i = 0; i < 3; i++) { say([K.alt, '↓'], '把这一行往下移'); act('editor.action.moveLinesDownAction'); if (!await pause(420)) return }
            for (let i = 0; i < 3; i++) { say([K.alt, '↑'], '再移回去'); act('editor.action.moveLinesUpAction'); if (!await pause(420)) return }

            // 4. ⌘/ 注释一整段
            ed.setSelection(new monaco.Selection(17, 1, 23, 2))
            say([K.mod, '/'], '整段加注释，语法高亮跟着重算')
            if (!await pause(500)) return
            act('editor.action.commentLine')
            if (!await pause(1300)) return
            say([K.mod, '/'], '再去掉')
            act('editor.action.commentLine')
            if (!await pause(900)) return

            // 5. 全部折叠 / 展开
            ed.setPosition({ lineNumber: 1, column: 1 })
            say([K.mod, 'K', K.mod, '0'], '全部折叠')
            act('editor.foldAll')
            if (!await pause(1500)) return
            say([K.mod, 'K', K.mod, 'J'], '全部展开')
            act('editor.unfoldAll')
            if (!await pause(1000)) return

            // 6. 选中全部匹配,转大写
            const t = m.findMatches('fn', false, false, true, null, false)[0]
            ed.setSelection(t.range)
            say([K.mod, K.shift, 'L'], `选中全部 “fn”`)
            act('editor.action.selectHighlights')
            if (!await pause(900)) return
            say([], `${ed.getSelections()!.length} 个光标，一起转大写`)
            act('editor.action.transformToUppercase')
            if (!await pause(1300)) return

            // 7. ⌘Z 一路撤销回去
            let n = 0
            while (m.getValue() !== TS_DOC && n < 80) {
                n++
                say([K.mod, 'Z'], `撤销 ×${n}`)
                act('undo')
                if (!await pause(90)) return
            }
            say([], `撤销了 ${n} 步，回到原文。从头再来。`)
            if (!await pause(2200)) return
        }
    }
    const stopTour = () => {
        if (!benchEl.classList.contains('autoplay')) return
        token++
        benchEl.classList.remove('autoplay')
        say([], `交给你了。${K.mod}D 选下一个相同的词 · ${K.alt}点击 加光标 · F1 命令面板 · 右键菜单`)
    }
    host.addEventListener('pointerdown', stopTour, true)
    host.addEventListener('keydown', stopTour, true)

    // ── tabs ──
    const notes: Record<string, string> = {
        demo: '高亮：Shiki（TextMate 语法）。TS 的补全、hover、诊断要另装可选依赖 typescript，这个页面没带。',
        json: '校验、补全、hover：vscode-json-languageservice，主线程懒加载。"private" 的类型错了，鼠标放上去看。',
        css: '补全和文档：vscode-css-languageservice。光标放在 gap: 后面按 Ctrl+Space。',
        big: '',
    }
    const narrow = matchMedia('(max-width: 720px)').matches
    const BIG = narrow ? 200_000 : 1_000_000
    if (narrow) document.querySelector<HTMLButtonElement>('[data-tab=big]')!.textContent = '20 万行'
    let big: Model | null = null
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs button'))
    async function select(tab: string) {
        tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)))
        $('big-actions').hidden = tab !== 'big'
        stopTour()
        if (tab === 'big') {
            if (!big) {
                say([], `正在生成 ${fmt(BIG)} 行…`)
                await raf(); await raf()
                const t0 = performance.now()
                const text = bigDoc(BIG)
                const t1 = performance.now()
                big = monaco.editor.createModel(text, 'typescript')
                ed.setModel(big)
                await raf()
                const t2 = performance.now()
                $('big-out').textContent = `生成文本 ${Math.round(t1 - t0)} ms，建 model 并画出第一屏 ${Math.round(t2 - t1)} ms`
            } else ed.setModel(big)
            $('tab-note').textContent = `${fmt(BIG)} 行。滚动、查找、折叠、打字都只碰视口里的那几十行：看右边的 DOM 节点数，它不随文档变大。`
            say([], '点进去随便打字，右边是每一键的耗时。')
        } else {
            ed.setModel(models[tab])
            $('tab-note').textContent = notes[tab]
            if (tab === 'demo') void tour()
            else say([], tab === 'json' ? '鼠标放在 "yes" 上。' : '在 gap: 后面按 Ctrl+Space。')
        }
        hud()
    }
    tabs.forEach(b => b.addEventListener('click', () => { void select(b.dataset.tab!); if (b.dataset.tab !== 'demo') ed.focus() }))
    const jump = (line: number) => {
        const m = ed.getModel()!
        const l = Math.min(line, m.getLineCount())
        ed.setPosition({ lineNumber: l, column: 1 }); ed.revealLineInCenter(l); ed.focus()
    }
    $('go-end').addEventListener('click', () => jump(Number.MAX_SAFE_INTEGER))
    $('go-mid').addEventListener('click', () => jump(BIG / 2))
    $('go-mid').textContent = `回到第 ${fmt(BIG / 2)} 行`

    $('tab-note').textContent = notes.demo
    void tour()
    return { ed, models, select }
}

// ── 04 迁移:真的 DiffEditor ──
function initMigration() {
    const host = $('mig-diff')
    const lines = MIG_BEFORE.split('\n').length
    host.style.height = lines * 20 + 24 + 'px'
    const diff = monaco.editor.createDiffEditor(host, {
        theme: THEME, readOnly: true, originalEditable: false, automaticLayout: true, fontFamily: FONT, fontSize: 12.5, lineHeight: 20,
        minimap: { enabled: false }, scrollBeyondLastLine: false, renderOverviewRuler: false, folding: false, glyphMargin: false,
        scrollbar: { vertical: 'hidden', horizontal: 'auto', alwaysConsumeMouseWheel: false }, padding: { top: 12, bottom: 12 },
        enableSplitViewResizing: false, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, lineNumbersMinChars: 3,
    } as never)
    diff.setModel({
        original: monaco.editor.createModel(MIG_BEFORE, 'typescript'),
        modified: monaco.editor.createModel(MIG_AFTER, 'typescript'),
    })
}

main().catch(e => {
    console.error(e)
    $('cap-text').textContent = '编辑器加载失败：' + (e && e.message || e)
})
