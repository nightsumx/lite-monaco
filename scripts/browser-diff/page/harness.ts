// 页面侧驱动:同一份代码跑在真 Monaco 页和 lite-monaco 页上,只通过 Monaco 公共 API + 少量 DOM 探针取结果。
// Node 侧(run.mjs)按场景调 window.H.*,拿到 JSON 后比对。
/* eslint-disable @typescript-eslint/no-explicit-any */
export function install(kind: 'monaco' | 'lite', monaco: any): void {
    const w = window as any
    w.monacoAPI = monaco
    w.__kind = kind
    const E = monaco.editor.EditorOption
    let editor: any = null
    let diff: any = null // createDiff 之后是 diff 编辑器,editor 指向它的 modified 一侧
    let host: HTMLElement | null = null
    const errors: string[] = []
    window.addEventListener('error', e => errors.push(String(e.message)))
    window.addEventListener('unhandledrejection', e => { if (String((e.reason && e.reason.message) || e.reason) === 'Canceled') return; errors.push('unhandledrejection: ' + String((e.reason && e.reason.message) || e.reason)) })

    const r1 = (n: number) => Math.round(n * 100) / 100
    const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()))
    const settle = async (frames = 3) => { for (let i = 0; i < frames; i++) await raf(); await new Promise(r => setTimeout(r, 450)); await raf() }
    const safe = (f: () => any) => { try { return f() } catch (e: any) { return { __error: String(e && e.message || e) } } }

    const H = {
        kind,
        get editor() { return editor },
        errors,
        async create(cfg: any = {}) {
            if (diff) { try { diff.dispose() } catch { /* */ } diff = null }
            if (editor) { try { editor.dispose() } catch { /* */ } editor = null }
            try { monaco.editor.getModels().forEach((m: any) => m.dispose()) } catch { /* */ }
            host = document.getElementById('editor-container')!
            host.innerHTML = ''
            host.style.width = (cfg.width ?? 800) + 'px'
            host.style.height = (cfg.height ?? 400) + 'px'
            errors.length = 0
            await document.fonts.ready
            editor = monaco.editor.create(host, {
                value: cfg.value ?? '', language: cfg.language ?? 'plaintext', theme: cfg.theme ?? 'vs',
                fontFamily: 'Menlo, monospace', fontSize: 14, lineHeight: 20, fontLigatures: false,
                minimap: { enabled: false }, automaticLayout: false, scrollBeyondLastLine: true, detectIndentation: false, tabSize: 4, insertSpaces: true,
                ...(cfg.options ?? {}),
            })
            w.ed = editor
            await settle()
            return true
        },
        /** diff 编辑器:cfg = {original, modified, language, options(扁平 IDiffEditorOptions), width, height};editor 指向 modified 一侧 */
        async createDiff(cfg: any = {}) {
            if (diff) { try { diff.dispose() } catch { /* */ } diff = null }
            if (editor) { try { editor.dispose() } catch { /* */ } editor = null }
            try { monaco.editor.getModels().forEach((m: any) => m.dispose()) } catch { /* */ }
            host = document.getElementById('editor-container')!
            host.innerHTML = ''
            host.style.width = (cfg.width ?? 800) + 'px'
            host.style.height = (cfg.height ?? 400) + 'px'
            errors.length = 0
            await document.fonts.ready
            diff = monaco.editor.createDiffEditor(host, {
                theme: cfg.theme ?? 'vs',
                fontFamily: 'Menlo, monospace', fontSize: 14, lineHeight: 20, fontLigatures: false,
                minimap: { enabled: false }, automaticLayout: false, scrollBeyondLastLine: true, detectIndentation: false, tabSize: 4, insertSpaces: true,
                renderSideBySide: true, enableSplitViewResizing: true,
                ...(cfg.options ?? {}),
            })
            const lang = cfg.language ?? 'plaintext'
            diff.setModel({ original: monaco.editor.createModel(cfg.original ?? '', lang), modified: monaco.editor.createModel(cfg.modified ?? '', lang) })
            editor = diff.getModifiedEditor()
            w.ed = editor; w.diffEd = diff
            await H.waitDiff()
            await settle()
            return true
        },
        /** 等 diff 算完:Monaco 的 getLineChanges() 非 null / onDidUpdateDiff;最多 5 秒 */
        async waitDiff() {
            const t0 = Date.now()
            while (Date.now() - t0 < 5000) {
                if (diff.getLineChanges && diff.getLineChanges()) break
                await new Promise(r => setTimeout(r, 50))
            }
            await new Promise(r => setTimeout(r, 300))
        },
        get diff() { return diff },
        async setSize(width: number, height: number) {
            host!.style.width = width + 'px'; host!.style.height = height + 'px'
            if (diff) diff.layout(); else editor.layout()
            await settle()
        },
        focus() { editor.focus() },
        async exec(code: string) {
            // eslint-disable-next-line no-new-func
            const f = new Function('editor', 'monaco', 'H', 'diff', `return (async () => { ${code} })()`)
            const v = await f(editor, monaco, H, diff)
            await settle(2)
            return v === undefined ? null : v
        },
        /** 一个 (line,col) 的屏幕坐标(client px),给鼠标事件用 */
        where(line: number, col: number) {
            const p = editor.getScrolledVisiblePosition({ lineNumber: line, column: col })
            const b = host!.getBoundingClientRect()
            return { x: b.left + p.left + 0.5, y: b.top + p.top + p.height / 2 }
        },
        snap(spec: any = {}) {
            const out: any = {}
            const model = editor.getModel()
            if (spec.geometry !== false) {
                out.layout = safe(() => {
                    const li = editor.getLayoutInfo()
                    const o: any = {}
                    for (const k of ['width', 'height', 'glyphMarginLeft', 'glyphMarginWidth', 'lineNumbersLeft', 'lineNumbersWidth', 'decorationsLeft', 'decorationsWidth', 'contentLeft', 'contentWidth', 'contentHeight', 'verticalScrollbarWidth', 'horizontalScrollbarHeight', 'overviewRuler'])
                        if (li[k] !== undefined && typeof li[k] !== 'object') o[k] = li[k]
                    if (li.minimap) o.minimap = { left: li.minimap.minimapLeft, width: li.minimap.minimapWidth, height: li.minimap.minimapHeight, canvasInner: li.minimap.minimapCanvasInnerWidth }
                    return o
                })
                out.scroll = safe(() => ({ top: r1(editor.getScrollTop()), left: r1(editor.getScrollLeft()), height: r1(editor.getScrollHeight()), width: r1(editor.getScrollWidth()) }))
                out.content = safe(() => ({ height: r1(editor.getContentHeight()), width: r1(editor.getContentWidth()) }))
                out.font = safe(() => { const f = editor.getOption(E.fontInfo); return { lineHeight: f.lineHeight, fontSize: f.fontSize, charWidth: r1(f.typicalHalfwidthCharacterWidth), spaceWidth: r1(f.spaceWidth), digitWidth: r1(f.maxDigitWidth), fullwidth: r1(f.typicalFullwidthCharacterWidth) } })
                out.visibleRanges = safe(() => editor.getVisibleRanges().map((r: any) => [r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn]))
            }
            if (spec.lines) {
                const list = spec.lines === 'all' ? Array.from({ length: model.getLineCount() }, (_, i) => i + 1) : spec.lines
                out.lines = safe(() => Object.fromEntries(list.map((n: number) => [n, [r1(editor.getTopForLineNumber(n)), r1(editor.getBottomForLineNumber(n))]])))
            }
            if (spec.rows) { // 每个模型行占几个视觉行
                const list = spec.rows === 'all' ? Array.from({ length: model.getLineCount() }, (_, i) => i + 1) : spec.rows
                out.rows = safe(() => Object.fromEntries(list.map((n: number) => [n, Math.round((editor.getBottomForLineNumber(n) - editor.getTopForLineNumber(n)) / editor.getOption(E.lineHeight))])))
            }
            if (spec.positions) {
                out.pos = safe(() => Object.fromEntries(spec.positions.map(([l, c]: number[]) => {
                    const p = editor.getScrolledVisiblePosition({ lineNumber: l, column: c })
                    return [`${l},${c}`, p ? { top: r1(p.top), left: r1(p.left), height: p.height } : null]
                })))
            }
            if (spec.breaks) { // 折行点:每个模型行里「视觉行变化」的列
                const list = spec.breaks === 'all' ? Array.from({ length: model.getLineCount() }, (_, i) => i + 1) : spec.breaks
                out.breaks = safe(() => Object.fromEntries(list.map((n: number) => {
                    const max = model.getLineMaxColumn(n)
                    const bs: number[] = []
                    let prev: number | null = null
                    for (let c = 1; c <= max; c++) {
                        const p = editor.getScrolledVisiblePosition({ lineNumber: n, column: c })
                        const t = Math.round(p.top)
                        if (prev !== null && t !== prev) bs.push(c)
                        prev = t
                    }
                    return [n, bs]
                })))
            }
            if (spec.domBreaks) { // 真实渲染的视觉行:所有字符按 Range 矩形的 top 分组。只取视口内的行(Monaco 只渲染可见行,lite 多渲染一圈)。
                // 每行输出 [去掉首尾空白的文本, 第一个非空白字符的 left(相对编辑器内容区左缘,取整)]:缩进在两边的表示不同(nbsp / \t / padding),只比位置
                out.domBreaks = safe(() => {
                    const sel = kind === 'monaco' ? '.view-line' : '.cm-line'
                    const hb = host!.getBoundingClientRect()
                    const rows = new Map<number, { left: number, s: string }[]>()
                    for (const el of Array.from(host!.querySelectorAll(sel)) as HTMLElement[]) {
                        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
                        while (w.nextNode()) {
                            const n = w.currentNode as Text
                            for (let i = 0; i < n.length; i++) {
                                const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
                                const b = r.getBoundingClientRect()
                                if (b.width === 0 && b.height === 0) continue
                                if (b.top < hb.top - 1 || b.bottom > hb.bottom - 12) continue
                                const key = Math.round((b.top - hb.top) / 2) * 2
                                let arr = rows.get(key); if (!arr) rows.set(key, arr = [])
                                arr.push({ left: b.left - hb.left, s: n.data[i] })
                            }
                        }
                    }
                    return [...rows.entries()].sort((a, c) => a[0] - c[0]).map(([top, arr]) => {
                        arr.sort((a, c) => a.left - c.left)
                        const txt = arr.map(x => x.s).join('').replace(/\u00a0/g, ' ')
                        const first = arr.find(x => !/\s/.test(x.s))
                        return [top, txt.trim(), first ? Math.round(first.left) : null]
                    })
                })
            }
            if (spec.cursor !== false) {
                out.sel = safe(() => editor.getSelections().map((s: any) => [s.selectionStartLineNumber, s.selectionStartColumn, s.positionLineNumber, s.positionColumn]))
            }
            if (spec.cursorRect) {
                out.cursorRect = safe(() => {
                    const b = host!.getBoundingClientRect()
                    const sel = kind === 'monaco' ? '.cursors-layer .cursor' : '.cm-cursor'
                    return [...host!.querySelectorAll(sel)].map((el: any) => { const r = el.getBoundingClientRect(); return [Math.round(r.left - b.left), Math.round((r.top - b.top) / 2) * 2, Math.round(r.height)] })
                        .sort((a: number[], c: number[]) => a[1] - c[1] || a[0] - c[0])
                })
            }
            if (spec.selRects) { // 选区:按视觉行合并为 [行顶, 最左, 最右];高度另列(selHeights),因为两边画法不同
                out.selRects = safe(() => {
                    const b = host!.getBoundingClientRect()
                    const sel = kind === 'monaco' ? '.selected-text' : '.cm-selectedText'
                    const lh = editor.getOption(E.lineHeight)
                    const rows = new Map<number, [number, number]>()
                    for (const el of Array.from(host!.querySelectorAll(sel)) as HTMLElement[]) {
                        const r = el.getBoundingClientRect()
                        const row = Math.round((r.top - b.top + r.height / 2) / lh - 0.5)
                        const cur = rows.get(row); const l = r.left - b.left, rt = r.right - b.left
                        rows.set(row, cur ? [Math.min(cur[0], l), Math.max(cur[1], rt)] : [l, rt])
                    }
                    return [...rows.entries()].sort((a, c) => a[0] - c[0]).map(([row, [l, rt]]) => [row, Math.round(l), Math.round(rt)])
                })
                out.selHeights = safe(() => {
                    const sel = kind === 'monaco' ? '.selected-text' : '.cm-selectedText'
                    return [...new Set(Array.from(host!.querySelectorAll(sel)).map((el: any) => Math.round(el.getBoundingClientRect().height)))].sort()
                })
            }
            if (spec.value !== false) out.value = safe(() => model.getValue())
            if (spec.rects) { // 按各自的选择器收 DOM 矩形(相对编辑器容器),选择器写 {monaco:'..', lite:'..'}
                out.rects = safe(() => {
                    const sel = spec.rects[kind]
                    const b = host!.getBoundingClientRect()
                    return [...host!.querySelectorAll(sel)].map((el: any) => { const r = el.getBoundingClientRect(); return [r1(r.left - b.left), r1(r.top - b.top), r1(r.width), r1(r.height)] })
                        .sort((a: number[], b2: number[]) => a[1] - b2[1] || a[0] - b2[0])
                })
            }
            if (spec.count) { // 数 DOM 元素:{名: {monaco:'..', lite:'..'}}
                out.count = safe(() => Object.fromEntries(Object.entries(spec.count).map(([name, s]: any) => [name, host!.querySelectorAll(s[kind]).length])))
            }
            if (spec.glyphs) { // 每个字符的真实字形左缘(DOM Range;比 getScrolledVisiblePosition 更接近「屏上画成什么样」):{行号: [[字符, left], …]}
                out.glyphs = safe(() => {
                    const sel = kind === 'monaco' ? '.view-line' : '.cm-line'
                    const els = (Array.from(host!.querySelectorAll(sel)) as HTMLElement[]).filter(e => !e.hasAttribute('aria-hidden')).sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top)
                    const hb = host!.getBoundingClientRect()
                    const res: any = {}
                    for (const ln of spec.glyphs) {
                        const el = els.find(e => Math.abs(e.getBoundingClientRect().top - (editor.getTopForLineNumber(ln) - editor.getScrollTop() + hb.top)) < 6)
                        if (!el) { res[ln] = null; continue }
                        const row: any[] = []
                        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
                        while (w.nextNode()) {
                            const n = w.currentNode as Text
                            for (let i = 0; i < n.length; i++) {
                                const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
                                const b = r.getBoundingClientRect()
                                if (/[\s\u00a0]/.test(n.data[i])) continue // 空白:Monaco 的 tab 展开成多个 nbsp,字符数对不上,只比有字形的字符
                                row.push([n.data[i], Math.round(b.left - hb.left), Math.round(b.width)])
                            }
                        }
                        res[ln] = row
                    }
                    return res
                })
            }
            if (spec.eval) out.eval = safe(() => (new Function('editor', 'monaco', 'H', 'host', 'diff', `return (${spec.eval})`))(editor, monaco, H, host, diff))
            if (spec.diff && diff) out.diff = safe(() => H.diffProbe(spec.diff))
            return out
        },
        /** diff 编辑器探针(公共 API 为主):lineChanges / 两侧 layout、scroll、value / 选择器计数与矩形 */
        diffProbe(spec: any) {
            const o: any = {}
            const ed = [diff.getOriginalEditor(), diff.getModifiedEditor()]
            const b = host!.getBoundingClientRect()
            if (spec.changes !== false) o.changes = (diff.getLineChanges() ?? []).map((c: any) => [c.originalStartLineNumber, c.originalEndLineNumber, c.modifiedStartLineNumber, c.modifiedEndLineNumber, (c.charChanges ?? []).map((x: any) => [x.originalStartLineNumber, x.originalStartColumn, x.originalEndLineNumber, x.originalEndColumn, x.modifiedStartLineNumber, x.modifiedStartColumn, x.modifiedEndLineNumber, x.modifiedEndColumn])])
            if (spec.chars === false) for (const c of o.changes ?? []) c.pop()
            if (spec.layout) o.layout = ed.map((e: any) => { const li = e.getLayoutInfo(); return { left: li.contentLeft, w: li.width, h: li.height, cw: li.contentWidth, lnw: li.lineNumbersWidth, gm: li.glyphMarginWidth, dw: li.decorationsWidth } })
            if (spec.scroll) o.scroll = ed.map((e: any) => ({ top: r1(e.getScrollTop()), left: r1(e.getScrollLeft()), h: r1(e.getScrollHeight()), w: r1(e.getScrollWidth()), ch: r1(e.getContentHeight()) }))
            if (spec.values) o.values = ed.map((e: any) => e.getValue())
            if (spec.visible) o.visible = ed.map((e: any) => e.getVisibleRanges().map((r: any) => [r.startLineNumber, r.endLineNumber]))
            if (spec.sel) o.sel = ed.map((e: any) => { const s = e.getSelection(); return s ? [s.selectionStartLineNumber, s.selectionStartColumn, s.positionLineNumber, s.positionColumn] : null })
            if (spec.tops) o.tops = ed.map((e: any) => Object.fromEntries(spec.tops.map((n: number) => [n, [r1(e.getTopForLineNumber(n)), r1(e.getBottomForLineNumber(n))]])))
            if (spec.contentHeight) o.contentHeight = ed.map((e: any) => r1(e.getContentHeight()))
            if (spec.readOnly) o.readOnly = ed.map((e: any) => e.getOption(E.readOnly))
            if (spec.count) o.count = Object.fromEntries(Object.entries(spec.count).map(([name, s]: any) => [name, host!.querySelectorAll(s[kind] ?? s.both).length]))
            if (spec.rects) o.rects = Object.fromEntries(Object.entries(spec.rects).map(([name, s]: any) => [name, [...host!.querySelectorAll(s[kind] ?? s.both)].map((el: any) => { const r = el.getBoundingClientRect(); return [r1(r.left - b.left), r1(r.top - b.top), r1(r.width), r1(r.height)] }).sort((a: number[], c: number[]) => a[1] - c[1] || a[0] - c[0])]))
            if (spec.text) o.text = Object.fromEntries(Object.entries(spec.text).map(([name, s]: any) => [name, [...host!.querySelectorAll(s[kind] ?? s.both)].map((el: any) => (el.textContent || '').replace(/\u00a0/g, ' ').trim().slice(0, 80))]))
            if (spec.classes) o.classes = [...host!.querySelectorAll(spec.classes[kind] ?? spec.classes.both)].map((el: any) => el.className)
            return o
        },
        /** 无障碍:焦点元素的 role/aria 属性、live region 文本。两边 DOM 结构不同,所以是 info 级 */
        a11y() {
            const ae = document.activeElement as HTMLElement | null
            const attrs: Record<string, string> = {}
            if (ae) for (const a of Array.from(ae.attributes)) if (a.name.startsWith('aria-') || ['role', 'contenteditable', 'spellcheck', 'autocapitalize', 'autocorrect', 'autocomplete', 'wrap', 'readonly'].includes(a.name)) attrs[a.name] = a.value
            const lives = [...document.querySelectorAll('[aria-live],[role=status],[role=alert],[role=log]')].map((el: any) => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), live: el.getAttribute('aria-live'), text: (el.textContent || '').slice(0, 200) }))
            const roles: Record<string, number> = {}
            document.querySelectorAll('[role]').forEach((el: any) => { const r = el.getAttribute('role'); roles[r] = (roles[r] || 0) + 1 })
            return { active: ae ? { tag: ae.tagName.toLowerCase(), cls: ae.className, attrs } : null, lives, roles, accessibilitySupport: editor.getOption(E.accessibilitySupport), ariaLabel: editor.getOption(E.ariaLabel) }
        },
        async settle(n = 3) { await settle(n) },
    }
    w.H = H
}
