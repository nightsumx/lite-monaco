// 页面侧:同一份驱动跑在三个页面上(A 官方 @monaco-editor/react + 真 Monaco、B 官方 + lite-monaco、C lite-monaco/react),
// 只通过 React props 和 Monaco 公共 API 观察,Node 侧(run.mjs)比 B、C 对 A。
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

export interface Lib { Editor: any, DiffEditor: any, useMonaco: () => any, loader: any, monaco: any }

export function installReact(kind: string, lib: Lib): void {
    const { monaco } = lib
    const log: any[] = []
    const errors: string[] = []
    window.addEventListener('error', e => errors.push(String(e.message)))
    window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + JSON.stringify(e.reason?.message ?? e.reason)))
    let editor: any = null
    let isDiff = false
    let mounts = 0
    let setSpec: (f: (s: any) => any) => void = () => {}
    let root: any = null
    const host = document.getElementById('host')!
    const cache = new Map<string, any>()
    const cb = (k: string, f: any) => { if (!cache.has(k)) cache.set(k, f); return cache.get(k) }

    const onMount = (e: any, m: any) => {
        editor = e; mounts++
        log.push(['onMount', m === monaco, isDiff ? [e.getOriginalEditor().getValue(), e.getModifiedEditor().getValue()] : e.getValue()])
    }
    function Probe() { const m = lib.useMonaco(); log.push(['useMonaco', m === null ? null : m === monaco]); return null }

    function App({ init }: { init: any }) {
        const [spec, set] = React.useState(init)
        setSpec = set
        const tag = spec.tag ?? 'a'
        const p: any = { ...spec.props, onMount }
        if (spec.beforeMount) p.beforeMount = cb('bm', (m: any) => {
            log.push(['beforeMount', m === monaco, m.editor.getModels().length, m.editor.getEditors().length])
            if (spec.beforeMount === 'theme') m.editor.defineTheme('my', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#102030' } })
            // 真实用法:beforeMount 里配语言服务(0.55 的顶层 monaco.json / monaco.typescript)
            if (spec.beforeMount === 'langdefaults') {
                m.json.jsonDefaults.setDiagnosticsOptions({ validate: true, schemas: [{ uri: 'http://x/cfg.schema.json', fileMatch: ['cfg.json'],
                    schema: { type: 'object', properties: { n: { type: 'number' }, name: { type: 'string' } }, required: ['name'] } }] })
                m.typescript.typescriptDefaults.setCompilerOptions({ strict: true, target: m.typescript.ScriptTarget.ESNext })
                log.push(['langdefaults', m.languages.json === m.json, m.languages.typescript === m.typescript,
                    m.typescript.typescriptDefaults.getCompilerOptions().target, m.typescript.ModuleKind.ESNext])
            }
        })
        if (spec.onChange) p.onChange = cb('oc:' + tag + (spec.controlled ? ':c' : ''), (v: any, ev: any) => {
            log.push(['onChange:' + tag, v, ev.changes.length, ev.isFlush])
            if (spec.controlled) set(s => ({ ...s, props: { ...s.props, value: v } }))
        })
        if (spec.onValidate) p.onValidate = cb('ov:' + tag, (ms: any[]) => log.push(['onValidate:' + tag, ms.map(m => [m.message, m.severity, m.startLineNumber, m.resource.toString()])]))
        const C = isDiff ? lib.DiffEditor : lib.Editor
        return <>{spec.probe && <Probe />}{spec.show !== false && <C key={spec.key ?? 'k'} {...p} />}</>
    }

    const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()))
    const settle = async () => { await raf(); await raf(); await new Promise(r => setTimeout(r, 100)); await raf() }
    const dom = (el: Element, depth = 2): any => ({
        tag: el.tagName.toLowerCase(),
        attrs: Object.fromEntries([...el.attributes].filter(a => depth > 0 || a.name !== 'class').map(a => [a.name, a.value])),
        kids: depth > 0 ? [...el.children].map(c => dom(c, depth - 1)) : el.children.length,
        text: depth > 0 && el.children.length === 0 ? el.textContent : undefined,
    })
    // 编辑区中间那一点往上找第一个不透明背景(两边的 DOM 不同,不按类名找)
    const bgAt = () => {
        const sec = host.querySelector('section'); if (!sec) return null
        const r = sec.getBoundingClientRect()
        let el = document.elementFromPoint(r.left + r.width * 0.6, r.top + r.height * 0.6) as HTMLElement | null
        while (el && el !== document.body) { const c = getComputedStyle(el).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; el = el.parentElement }
        return null
    }
    const one = (e: any) => {
        const model = e.getModel()
        if (!model) return { model: null }
        const pos = e.getPosition()
        const E = monaco.editor.EditorOption
        return {
            uri: model.uri.toString(), value: e.getValue(), lang: model.getLanguageId(), pos: pos && [pos.lineNumber, pos.column],
            readOnly: e.getOption(E.readOnly), fontSize: e.getOption(E.fontSize), lineNumbers: e.getOption(E.lineNumbers)?.renderType,
            wordWrap: e.getOption(E.wordWrap), visibleTop: e.getVisibleRanges()[0]?.startLineNumber,
        }
    }

    const R = {
        kind, log, errors,
        get editor() { return editor },
        /** 挂上;返回挂上后同步时刻的 DOM(A、B 这时还是 Loading,C 已经建好:有意不同) */
        mount(spec: any) {
            isDiff = !!spec.diff
            root = createRoot(host)
            const el = <App init={spec} />
            flushSync(() => root.render(spec.strict ? <React.StrictMode>{el}</React.StrictMode> : el))
            return { loading: !!host.querySelector('section > div:not([class]):first-child')?.textContent, ready: !!editor }
        },
        async ready() {
            const t0 = Date.now()
            while (!editor && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 20))
            await settle()
            return !!editor
        },
        async update(patch: any) {
            flushSync(() => setSpec(s => ({ ...s, ...patch, props: { ...s.props, ...(patch.props ?? {}) } })))
            await settle()
        },
        async unmount() { root?.unmount(); root = null; await settle() },
        async run(code: string) { const r = await new Function('editor', 'monaco', 'R', `return (async () => { ${code} })()`)(editor, monaco, R); await settle(); return r },
        settle,
        state() {
            const e = editor
            let ed: any = null
            try {
                if (e && isDiff) { const m = e.getModel(); ed = m && { original: one(e.getOriginalEditor()), modified: one(e.getModifiedEditor()) } }
                else if (e) ed = one(e)
            } catch (err: any) { ed = { __error: String(err?.message ?? err) } }
            return {
                ed,
                models: monaco.editor.getModels().map((m: any) => [m.uri.toString(), m.getLanguageId(), m.getValue()]),
                editors: monaco.editor.getEditors().length, diffs: monaco.editor.getDiffEditors().length,
                mounts, bg: bgAt(),
                dom: host.firstElementChild ? dom(host.firstElementChild, 1) : null,
            }
        },
    }
    ;(window as any).R = R
}
