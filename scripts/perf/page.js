// 性能基准的页面端:同一份场景代码跑在真 Monaco 和 lite-monaco 上。
// 每个 phase 记两个数:wall(操作起到两帧之后,受 16.7ms 垂直同步量化)和 cpu(主线程任务时间,来自 CDP Performance.getMetrics,不受量化影响)。
// cpu 才是区分实现快慢的数;wall 是用户感知到的上限。
export function install(monaco) {
    const raf = () => new Promise(r => requestAnimationFrame(() => r()))
    const raf2 = async () => { await raf(); await raf() }
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] }
    const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }

    // ── 文本生成(确定性) ──
    function genTs(n) {
        const out = new Array(n)
        for (let i = 0; i < n; i++) {
            switch (i % 10) {
                case 0: out[i] = `export function task${i}(input: number, name = "n${i}"): number {`; break
                case 1: out[i] = `  const base = input * ${i} + ${i % 97} // compute ${i}`; break
                case 2: out[i] = `  if (base % 2 === 0 && name.length > ${i % 7}) {`; break
                case 3: out[i] = `    return base / 2 + Math.max(1, ${i % 13})`; break
                case 4: out[i] = `  } else {`; break
                case 5: out[i] = `    /* branch ${i} */ return \`v\${base}-\${name}\``; break
                case 6: out[i] = `  }`; break
                case 7: out[i] = `}`; break
                case 8: out[i] = ``; break
                default: out[i] = `interface I${i} { readonly a: string; b?: number[] }`
            }
        }
        return out.join('\n')
    }
    const genLong = (len, unit = 'abcdefghij ') => unit.repeat(Math.ceil(len / unit.length)).slice(0, len)
    function genCjk(n) {
        const u = ['你好，世界！这是一行中文文本，用来测试宽字符。', '日本語のテキスト😀🎉👨‍👩‍👧 emoji mixed', 'English line with العربية RTL and 한국어 Hangul text']
        return Array.from({ length: n }, (_, i) => u[i % 3] + ' ' + i).join('\n')
    }
    function genMinified(lines, len) {
        return Array.from({ length: lines }, (_, i) => { let s = ''; let k = 0; while (s.length < len) s += `function f${i}_${k++}(a,b){return a+b*${k}}var x${k}="s${k}";`; return s.slice(0, len) }).join('\n')
    }

    const mk = (parent, o = {}) => monaco.editor.create(parent, { language: 'typescript', automaticLayout: false, minimap: { enabled: true }, scrollBeyondLastLine: true, fontSize: 14, ...o })
    const el = () => { const e = document.getElementById('e'); e.innerHTML = ''; return e }
    const newEd = (value, language = 'typescript', o = {}) => {
        const model = monaco.editor.createModel(value, language)
        const ed = mk(el(), { model, ...o }); ed.layout()
        window.__keep = { ed, model }
        return { ed, model }
    }

    const S = {}
    const P = () => {
        const out = {}
        const ph = async (name, fn) => {
            await window.__cpu('start'); const t = performance.now()
            const r = await fn(); await raf2()
            out[name] = performance.now() - t; out[name + '.cpu'] = await window.__cpu('end')
            return r
        }
        // 只量同步部分(不等帧):操作本身占用主线程多久
        const sync = (name, fn) => { const t = performance.now(); const r = fn(); out[name] = performance.now() - t; return r }
        return { out, ph, sync }
    }

    // ── 加载 ──
    for (const n of [1000, 100000, 500000]) {
        S[`load_${n}`] = async () => {
            const { out, ph, sync } = P(); const text = genTs(n)
            const ed = mk(el()); ed.layout(); await raf2()
            let model
            sync('createModel', () => { model = monaco.editor.createModel(text, 'typescript') })
            await ph('setModel+paint', () => { ed.setModel(model) })
            sync('getValue', () => model.getValue().length)
            sync('getLineCount', () => model.getLineCount())
            window.__keep = { ed, model }
            await ph('setValue+paint', () => { model.setValue(text) })
            return out
        }
    }
    S.load_unicode_50k = async () => {
        const { out, ph } = P(); const text = genCjk(50000)
        const ed = mk(el()); ed.layout(); await raf2()
        const model = monaco.editor.createModel(text, 'plaintext'); window.__keep = { ed, model }
        await ph('setModel+paint', () => ed.setModel(model))
        return out
    }
    S.load_1M_lines = async () => {
        const { out, ph, sync } = P(); const text = genTs(1000000)
        const ed = mk(el()); ed.layout(); await raf2()
        let model; sync('createModel', () => { model = monaco.editor.createModel(text, 'typescript') })
        await ph('setModel+paint', () => ed.setModel(model)); window.__keep = { ed, model }
        await ph('goto_end', () => { ed.setPosition({ lineNumber: 1000000, column: 1 }); ed.revealLine(1000000) })
        return out
    }

    // ── 滚动(API 驱动,逐帧) ──
    S.scroll_100k = async () => {
        const { out, ph } = P(); const { ed, model } = newEd(genTs(100000)); await raf2()
        const lh = ed.getOption(monaco.editor.EditorOption.lineHeight)
        const fr = []; let last = performance.now()
        await window.__cpu('start'); const t0 = performance.now()
        for (let i = 0; i < 200; i++) { ed.setScrollTop(ed.getScrollTop() + lh * 40); await raf(); const n = performance.now(); fr.push(n - last); last = n }
        out['scroll200frames'] = performance.now() - t0; out['scroll200frames.cpu'] = await window.__cpu('end')
        out['scroll.frame_p95'] = pct(fr, 0.95); out['scroll.frame_max'] = Math.max(...fr)
        await ph('jump_to_end', () => ed.setScrollTop(1e9))
        await ph('jump_to_top', () => ed.setScrollTop(0))
        const rnd = []; let seed = 7
        for (let i = 0; i < 30; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; rnd.push(1 + seed % 100000) }
        await window.__cpu('start'); const t1 = performance.now()
        for (const ln of rnd) { ed.revealLineInCenter(ln); await raf2() }
        out['random_jump_x30'] = performance.now() - t1; out['random_jump_x30.cpu'] = await window.__cpu('end')
        return out
    }
    S.scroll_wrap_100k = async () => {
        const { out, ph } = P(); const { ed } = newEd(genTs(100000), 'typescript', { wordWrap: 'on' }); await ph('wrap_layout', () => ed.layout())
        const lh = ed.getOption(monaco.editor.EditorOption.lineHeight)
        await window.__cpu('start'); const t0 = performance.now()
        for (let i = 0; i < 100; i++) { ed.setScrollTop(ed.getScrollTop() + lh * 40); await raf() }
        out['scroll100frames'] = performance.now() - t0; out['scroll100frames.cpu'] = await window.__cpu('end')
        await ph('toggle_wrap_off', () => ed.updateOptions({ wordWrap: 'off' }))
        await ph('toggle_wrap_on', () => ed.updateOptions({ wordWrap: 'on' }))
        await ph('resize_600', () => { el().style.width = '600px'; ed.layout() })
        await ph('resize_1000', () => { el().style.width = '1000px'; ed.layout() })
        return out
    }
    // 跳到很远的地方后,高亮要多久出现(增量/按需分词能力)
    S.jump_highlight_100k = async () => {
        const { out } = P(); const { ed } = newEd(genTs(100000)); await raf2(); await sleep(300)
        const colored = () => {
            const set = new Set()
            for (const s of ed.getDomNode().querySelectorAll('span')) { if (s.children.length === 0 && s.textContent) set.add(s.className + '|' + s.style.color) }
            return set.size
        }
        const waitColored = async limit => { const t = performance.now(); while (colored() < 4 && performance.now() - t < limit) await raf(); return performance.now() - t }
        const jump = async ln => { ed.revealLineInCenter(ln); const t = performance.now(); await raf2(); return waitColored(8000).then(() => performance.now() - t) }
        out['colored_at_line_50000'] = await jump(50000)
        out['colored_at_line_99990'] = await jump(99990)
        out['colored_at_line_10'] = await jump(10)
        return out
    }
    S.tokenize_all_20k = async () => {
        const { out, sync } = P(); const text = genTs(20000)
        sync('monaco.editor.tokenize', () => monaco.editor.tokenize(text, 'typescript'))
        return out
    }

    // ── 编辑(API) ──
    S.edit_api_100k = async () => {
        const { out, ph, sync } = P(); const { ed, model } = newEd(genTs(100000)); await raf2()
        ed.setPosition({ lineNumber: 50000, column: 1 }); ed.revealLineInCenter(50000); await raf2()
        const ts = []
        for (let i = 0; i < 100; i++) {
            const t = performance.now()
            ed.executeEdits('p', [{ range: new monaco.Range(50000, 1 + i, 50000, 1 + i), text: 'x', forceMoveMarkers: true }])
            ts.push(performance.now() - t); await raf()
        }
        out['single_char_edit_sync_p50'] = med(ts); out['single_char_edit_sync_p95'] = pct(ts, 0.95)
        await ph('type_100_chars_trigger', async () => { for (let i = 0; i < 100; i++) ed.trigger('kb', 'type', { text: 'y' }) })
        const edits = []; for (let i = 0; i < 10000; i++) edits.push({ range: new monaco.Range(1 + i * 10, 1, 1 + i * 10, 1), text: '// ' })
        await ph('executeEdits_10k_scattered', () => ed.executeEdits('p', edits))
        await ph('undo_10k_scattered', () => ed.trigger('kb', 'undo'))
        await ph('redo_10k_scattered', () => ed.trigger('kb', 'redo'))
        const big = '0123456789'.repeat(500000)
        await ph('insert_5MB_one_edit', () => ed.executeEdits('p', [{ range: new monaco.Range(1, 1, 1, 1), text: big }]))
        await ph('undo_5MB', () => ed.trigger('kb', 'undo'))
        sync('applyEdits_50k', () => { const e = []; for (let i = 0; i < 50000; i++) e.push({ range: new monaco.Range(1 + i, 1, 1 + i, 1), text: '#' }); model.applyEdits(e) })
        await raf2()
        return out
    }
    S.undo_stack = async () => {
        const { out, ph } = P(); const { ed, model } = newEd(genTs(5000)); await raf2()
        ed.setPosition({ lineNumber: 100, column: 1 })
        await ph('1000_typed_chars', async () => { for (let i = 0; i < 1000; i++) { ed.trigger('kb', 'type', { text: String.fromCharCode(97 + i % 26) }); if (i % 40 === 39) model.pushStackElement() } })
        await ph('undo_x25', async () => { for (let i = 0; i < 25; i++) ed.trigger('kb', 'undo') })
        await ph('redo_x25', async () => { for (let i = 0; i < 25; i++) ed.trigger('kb', 'redo') })
        return out
    }
    S.multicursor_100k = async () => {
        const { out, ph, sync } = P(); const { ed, model } = newEd(genTs(100000)); await raf2()
        let ms; sync('findMatches_const_all', () => { ms = model.findMatches('return', false, false, true, null, false) })
        out['matches'] = ms.length
        await ph('setSelections_matches', () => ed.setSelections(ms.map(m => new monaco.Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn))))
        await ph('type_1_char_all_cursors', () => ed.trigger('kb', 'type', { text: 'X' }))
        await ph('undo', () => ed.trigger('kb', 'undo'))
        await ph('collapse_cursors', () => ed.setPosition({ lineNumber: 1, column: 1 }))
        return out
    }
    S.select_all_500k = async () => {
        const { out, ph, sync } = P(); const { ed, model } = newEd(genTs(500000)); await raf2()
        await ph('selectAll', () => ed.trigger('kb', 'selectAll'))
        sync('getSelection_text', () => model.getValueInRange(ed.getSelection()).length)
        await ph('delete_all', () => ed.trigger('kb', 'deleteLeft'))
        await ph('undo_delete_all', () => ed.trigger('kb', 'undo'))
        return out
    }
    S.find_500k = async () => {
        const { out, sync } = P(); const { model } = newEd(genTs(500000)); await raf2()
        const q = (name, ...a) => { const r = sync(name, () => model.findMatches(...a)); out[name + '.count'] = r.length }
        q('literal_return', 'return', false, false, false, null, false)
        q('literal_matchCase', 'return', false, false, true, null, false)
        q('regex_function_name', '\\bfunction\\s+\\w+', false, true, false, null, false)
        q('regex_wholeword', 'base', false, false, true, 'a', false)
        q('regex_multiline', 'return[^\\n]*\\n\\s*\\}', false, true, false, null, false)
        sync('findNextMatch_x1000', () => { let p = new monaco.Position(1, 1); for (let i = 0; i < 1000; i++) { const m = model.findNextMatch('return', p, false, false, null, false); if (!m) break; p = m.range.getEndPosition() } })
        return out
    }
    S.model_api_500k = async () => {
        const { out, sync } = P(); const { model } = newEd(genTs(500000)); await raf2()
        let seed = 3; const r = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
        sync('getLineContent_x1M', () => { let s = 0; for (let i = 0; i < 1e6; i++) s += model.getLineContent(1 + r(500000)).length; return s })
        sync('getOffsetAt_x300k', () => { for (let i = 0; i < 3e5; i++) model.getOffsetAt({ lineNumber: 1 + r(500000), column: 1 }) })
        sync('getPositionAt_x300k', () => { const len = model.getValueLength(); for (let i = 0; i < 3e5; i++) model.getPositionAt(r(len)) })
        sync('getValueInRange_x100k', () => { for (let i = 0; i < 1e5; i++) { const l = 1 + r(499990); model.getValueInRange(new monaco.Range(l, 1, l + 5, 1)) } })
        sync('getLinesContent', () => model.getLinesContent().length)
        sync('getValue', () => model.getValue().length)
        sync('getLineMaxColumn_x1M', () => { for (let i = 0; i < 1e6; i++) model.getLineMaxColumn(1 + r(500000)) })
        return out
    }

    // ── 折叠 / 装饰 / 标记 ──
    S.fold_100k = async () => {
        const { out, ph } = P(); const { ed } = newEd(genTs(100000)); await raf2(); await sleep(500)
        await ph('foldAll', () => ed.trigger('kb', 'editor.foldAll'))
        await ph('unfoldAll', () => ed.trigger('kb', 'editor.unfoldAll'))
        await ph('foldAll_again', () => ed.trigger('kb', 'editor.foldAll'))
        await ph('scroll_end_folded', () => ed.setScrollTop(1e9))
        return out
    }
    S.decorations_100k = async () => {
        const { out, ph } = P(); const { ed, model } = newEd(genTs(100000)); await raf2()
        const ds = []; for (let i = 1; i <= 100000; i += 1) ds.push({ range: new monaco.Range(i, 1, i, 5), options: { inlineClassName: 'perf-d', className: i % 10 === 0 ? 'perf-line' : undefined } })
        let coll; await ph('add_100k_decorations', () => { coll = ed.createDecorationsCollection(ds) })
        const lh = ed.getOption(monaco.editor.EditorOption.lineHeight)
        await window.__cpu('start'); const t = performance.now()
        for (let i = 0; i < 100; i++) { ed.setScrollTop(ed.getScrollTop() + lh * 40); await raf() }
        out['scroll100frames_decorated'] = performance.now() - t; out['scroll100frames_decorated.cpu'] = await window.__cpu('end')
        await ph('edit_with_decorations', () => ed.executeEdits('p', [{ range: new monaco.Range(1, 1, 1, 1), text: 'x\n' }]))
        await ph('clear_decorations', () => coll.clear())
        return out
    }
    S.markers_10k = async () => {
        const { out, ph } = P(); const { ed, model } = newEd(genTs(100000)); await raf2()
        const ms = []; for (let i = 0; i < 10000; i++) ms.push({ severity: 8, message: 'm' + i, startLineNumber: 1 + i * 10, startColumn: 1, endLineNumber: 1 + i * 10, endColumn: 6 })
        await ph('setModelMarkers_10k', () => monaco.editor.setModelMarkers(model, 'perf', ms))
        out.getModelMarkers = (() => { const t = performance.now(); monaco.editor.getModelMarkers({ resource: model.uri }); return performance.now() - t })()
        await ph('scroll_with_markers', () => ed.setScrollTop(1e9))
        await ph('clear_markers', () => monaco.editor.setModelMarkers(model, 'perf', []))
        return out
    }

    // ── 很多 model / 很多 editor ──
    S.many_models = async () => {
        const { out, ph, sync } = P(); const text = genTs(2000)
        const ed = mk(el()); ed.layout(); await raf2()
        const ms = []
        await ph('create_500_models', () => { for (let i = 0; i < 500; i++) ms.push(monaco.editor.createModel(text + i, 'typescript')) })
        await window.__cpu('start'); const t = performance.now()
        for (let i = 0; i < 200; i++) { ed.setModel(ms[(i * 37) % 500]); await raf() }
        out['switch_x200'] = performance.now() - t; out['switch_x200.cpu'] = await window.__cpu('end')
        window.__keep = { ed, ms }
        await ph('dispose_500_models', () => { ed.setModel(null); for (const m of ms) m.dispose() })
        return out
    }
    S.many_editors_40 = async () => {
        const { out, ph } = P(); const text = genTs(200)
        const host = document.getElementById('e'); host.innerHTML = ''; host.style.cssText = 'width:1000px;height:600px;overflow:auto'
        const eds = []
        await ph('create_40_editors', () => {
            for (let i = 0; i < 40; i++) {
                const d = document.createElement('div'); d.style.cssText = 'width:900px;height:200px'; host.appendChild(d)
                eds.push(mk(d, { value: text, minimap: { enabled: false } })); eds[i].layout()
            }
        })
        window.__keep = { eds }
        await ph('dispose_40_editors', () => { for (const e of eds) { const m = e.getModel(); e.dispose(); m && m.dispose() } })
        host.style.cssText = ''
        return out
    }
    S.create_editor_cold = async () => {
        const { out, ph } = P()
        const ts = []
        for (let i = 0; i < 10; i++) {
            const e = el(); const t = performance.now(); const ed = mk(e, { value: genTs(100) }); ed.layout(); await raf2(); ts.push(performance.now() - t)
            const m = ed.getModel(); ed.dispose(); m.dispose()
        }
        out['create_first'] = ts[0]; out['create_warm_p50'] = med(ts.slice(1))
        return out
    }

    // ── 长行 ──
    S.longline_1M_chars = async () => {
        const { out, ph } = P(); const { ed, model } = newEd(genLong(1000000)); await ph('paint', () => ed.layout())
        ed.setPosition({ lineNumber: 1, column: 500000 }); await ph('reveal_mid', () => ed.revealPositionInCenter({ lineNumber: 1, column: 500000 }))
        await ph('insert_char_mid', () => ed.executeEdits('p', [{ range: new monaco.Range(1, 500000, 1, 500000), text: 'x' }]))
        await window.__cpu('start'); const t = performance.now()
        for (let i = 0; i < 40; i++) { ed.setScrollLeft(ed.getScrollLeft() + 800); await raf() }
        out['hscroll40frames'] = performance.now() - t; out['hscroll40frames.cpu'] = await window.__cpu('end')
        await ph('selectAll', () => ed.trigger('kb', 'selectAll'))
        await ph('wrap_on', () => ed.updateOptions({ wordWrap: 'on' }))
        await ph('wrap_off', () => ed.updateOptions({ wordWrap: 'off' }))
        return out
    }
    S.minified_20x100k = async () => {
        const { out, ph } = P(); const { ed } = newEd(genMinified(20, 100000)); await ph('paint', () => ed.layout())
        await ph('click_end_line', () => { ed.setPosition({ lineNumber: 10, column: 99999 }); ed.revealPosition({ lineNumber: 10, column: 99999 }) })
        await ph('type_char', () => ed.trigger('kb', 'type', { text: 'z' }))
        await ph('wrap_on', () => ed.updateOptions({ wordWrap: 'on' }))
        return out
    }
    S.wide_10k_lines_1000_chars = async () => {
        const { out, ph } = P(); const { ed } = newEd(Array.from({ length: 10000 }, (_, i) => genLong(1000, `word${i} `)).join('\n'))
        await ph('paint', () => ed.layout())
        await ph('wrap_on', () => ed.updateOptions({ wordWrap: 'on' }))
        await window.__cpu('start'); const t = performance.now()
        for (let i = 0; i < 100; i++) { ed.setScrollTop(ed.getScrollTop() + 800); await raf() }
        out['scroll100frames_wrapped'] = performance.now() - t; out['scroll100frames_wrapped.cpu'] = await window.__cpu('end')
        return out
    }

    // ── 选项与主题 ──
    S.options_100k = async () => {
        const { out, ph } = P(); const { ed } = newEd(genTs(100000)); await raf2()
        let fs = 12
        await window.__cpu('start'); const t = performance.now()
        for (let i = 0; i < 20; i++) { ed.updateOptions({ fontSize: fs = fs === 12 ? 16 : 12 }); await raf2() }
        out['fontSize_toggle_x20'] = performance.now() - t; out['fontSize_toggle_x20.cpu'] = await window.__cpu('end')
        await ph('minimap_off', () => ed.updateOptions({ minimap: { enabled: false } }))
        await ph('minimap_on', () => ed.updateOptions({ minimap: { enabled: true } }))
        await ph('lineNumbers_off', () => ed.updateOptions({ lineNumbers: 'off' }))
        await ph('theme_vs_dark', () => monaco.editor.setTheme('vs-dark'))
        await ph('theme_vs', () => monaco.editor.setTheme('vs'))
        await ph('setModelLanguage_json', () => monaco.editor.setModelLanguage(ed.getModel(), 'json'))
        return out
    }
    S.minimap_scroll_100k = async () => {
        const { out } = P(); const { ed } = newEd(genTs(100000), 'typescript', { minimap: { enabled: true } }); await raf2()
        await window.__cpu('start'); const t = performance.now()
        for (let i = 0; i < 100; i++) { ed.setScrollTop(ed.getScrollTop() + 1200); await raf() }
        out['scroll100frames_minimap'] = performance.now() - t; out['scroll100frames_minimap.cpu'] = await window.__cpu('end')
        return out
    }

    // ── diff ──
    for (const n of [5000, 20000]) {
        S[`diff_${n}`] = async () => {
            const { out, ph } = P()
            const a = genTs(n).split('\n'); const b = a.slice()
            for (let i = 0; i < n; i += 100) b[i] = b[i] + ' // changed'
            for (let i = 50; i < n; i += 400) b.splice(i, 3)
            for (let i = 70; i < n; i += 500) b.splice(i, 0, '// inserted a', '// inserted b')
            const host = el(); const de = monaco.editor.createDiffEditor(host, { automaticLayout: false, renderSideBySide: true })
            de.layout()
            const o = monaco.editor.createModel(a.join('\n'), 'typescript'), m = monaco.editor.createModel(b.join('\n'), 'typescript')
            window.__keep = { de, o, m }
            await window.__cpu('start'); const t = performance.now()
            const done = new Promise(r => { const d = de.onDidUpdateDiff(() => { d.dispose && d.dispose(); r() }) })
            de.setModel({ original: o, modified: m })
            await Promise.race([done, sleep(30000)]); out['diff_computed'] = performance.now() - t
            await raf2(); out['diff_painted'] = performance.now() - t; out['diff_painted.cpu'] = await window.__cpu('end')
            const lc = de.getLineChanges(); out['changes'] = lc ? lc.length : -1
            await ph('scroll_end', () => de.getModifiedEditor().setScrollTop(1e9))
            await ph('edit_in_modified', () => de.getModifiedEditor().executeEdits('p', [{ range: new monaco.Range(100, 1, 100, 1), text: 'edit\n' }]))
            await new Promise(r => { const d = de.onDidUpdateDiff(() => { d.dispose && d.dispose(); r() }); setTimeout(r, 10000) })
            await raf2()
            return out
        }
    }
    S.diff_inline_5000 = async () => {
        const { out } = P(); const n = 5000
        const a = genTs(n).split('\n'); const b = a.slice(); for (let i = 0; i < n; i += 50) b[i] = b[i] + ' // changed'
        const de = monaco.editor.createDiffEditor(el(), { automaticLayout: false, renderSideBySide: false }); de.layout()
        const o = monaco.editor.createModel(a.join('\n'), 'typescript'), m = monaco.editor.createModel(b.join('\n'), 'typescript'); window.__keep = { de, o, m }
        await window.__cpu('start'); const t = performance.now()
        const done = new Promise(r => { const d = de.onDidUpdateDiff(() => { d.dispose && d.dispose(); r() }) })
        de.setModel({ original: o, modified: m }); await Promise.race([done, sleep(30000)]); await raf2()
        out['inline_diff_painted'] = performance.now() - t; out['inline_diff_painted.cpu'] = await window.__cpu('end')
        return out
    }

    // ── 驱动端(真输入)用的页面辅助 ──
    window.__setup = async (kind) => {
        if (kind === 'typing_100k' || kind === 'nav_100k') { newEd(genTs(100000)); await raf2(); await sleep(400) }
        if (kind === 'typing_small') { newEd(genTs(200)); await raf2() }
        if (kind === 'typing_wrap') { newEd(genTs(100000), 'typescript', { wordWrap: 'on' }); await raf2(); await sleep(400) }
        if (kind === 'typing_longline') { newEd(genLong(300000) + '\n' + genTs(1000)); await raf2() }
        if (kind === 'wheel_100k') { newEd(genTs(100000)); await raf2(); await sleep(400) }
        const { ed } = window.__keep
        if (kind.startsWith('typing')) { ed.setPosition({ lineNumber: kind === 'typing_longline' ? 1 : 500, column: kind === 'typing_longline' ? 150000 : 1 }); ed.revealPositionInCenter(ed.getPosition()); ed.focus(); await raf2() }
        if (kind.startsWith('nav')) { ed.setPosition({ lineNumber: 1, column: 1 }); ed.focus(); await raf2() }
        if (kind.startsWith('wheel')) { ed.setPosition({ lineNumber: 1, column: 1 }); await raf2() }
        const r = ed.getDomNode().getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    // 事件 → 两帧后的延迟记录器(同时记事件处理本身的同步耗时)
    window.__rec = { lat: [], sync: [], long: 0, start(types) {
        this.lat = []; this.sync = []; this.long = 0; this.h = e => {
            const t = performance.now()
            requestAnimationFrame(() => requestAnimationFrame(() => this.lat.push(performance.now() - t)))
            queueMicrotask(() => {}); setTimeout(() => this.sync.push(performance.now() - t), 0)
        }
        this.types = types; for (const ty of types) document.addEventListener(ty, this.h, true)
        try { this.po = new PerformanceObserver(l => { for (const e of l.getEntries()) this.long += e.duration }); this.po.observe({ entryTypes: ['longtask'] }) } catch { }
    }, stop() { for (const ty of this.types) document.removeEventListener(ty, this.h, true); this.po && this.po.disconnect(); return { lat: this.lat, long: this.long } } }
    window.__drain = async () => { await raf2() }
    window.__S = S
    window.__pageInfo = () => ({ lines: window.__keep?.model?.getLineCount?.() })
}
