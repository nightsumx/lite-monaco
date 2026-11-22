// 能力: 诊断波浪线 + diagnosticsField + map 契约(M1.1)
import { describe, expect, it } from 'vitest'
import { setDiagnostics, diagnosticsField, diagnosticSquiggles, mapDiagnostics, goToNextProblem, goToPrevProblem } from '../../src/core/feature/diagnostics'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { tsDiagnosticsSession } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { MarkDecoration } from '../../src/core/model/decoration'

describe('diagnostics', () => {
    it('setDiagnostics 写入 field', () => {
        let state = EditorState.create({
            doc: 'const x = 1',
            extensions: [diagnosticsField],
        })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([
                { from: 0, to: 5, severity: 'error', message: 'bad' },
            ]),
        }))
        expect(state.field(diagnosticsField)).toHaveLength(1)
        expect(state.field(diagnosticsField)[0].message).toBe('bad')
    })

    it('doc 插入前移诊断区间', () => {
        let state = EditorState.create({
            doc: 'abcdef',
            extensions: [diagnosticsField],
        })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([
                { from: 2, to: 5, severity: 'error', message: 'e', source: 'ts' },
            ]),
        }))
        state = state.applyTransaction(state.update({
            changes: { from: 0, insert: 'XX' },
        }))
        const d = state.field(diagnosticsField)
        expect(d).toHaveLength(1)
        expect(d[0]).toMatchObject({ from: 4, to: 7, message: 'e', source: 'ts' })
    })

    it('诊断区间被整段删除则丢弃', () => {
        let state = EditorState.create({
            doc: 'abcdef',
            extensions: [diagnosticsField],
        })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([
                { from: 1, to: 3, severity: 'error', message: 'gone' },
                { from: 4, to: 6, severity: 'warning', message: 'keep' },
            ]),
        }))
        state = state.applyTransaction(state.update({
            changes: { from: 1, to: 3, insert: '' },
        }))
        const d = state.field(diagnosticsField)
        expect(d.map(x => x.message)).toEqual(['keep'])
        expect(d[0].from).toBe(2)
        expect(d[0].to).toBe(4)
    })

    it('setDiagnostics 覆盖,不与 map 叠加', () => {
        let state = EditorState.create({
            doc: 'abc',
            extensions: [diagnosticsField],
        })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([{ from: 0, to: 1, severity: 'error', message: 'old' }]),
        }))
        state = state.applyTransaction(state.update({
            changes: { from: 0, insert: '!' },
            effects: setDiagnostics.of([{ from: 0, to: 2, severity: 'warning', message: 'new' }]),
        }))
        expect(state.field(diagnosticsField)).toEqual([
            { from: 0, to: 2, severity: 'warning', message: 'new' },
        ])
    })

    it('mapDiagnostics 纯函数无 docChanged 原样', () => {
        const state = EditorState.create({ doc: 'ab', extensions: [diagnosticsField] })
        const tr = state.update({})
        const diags = [{ from: 0, to: 1, severity: 'info' as const, message: 'i' }]
        expect(mapDiagnostics(diags, tr)).toBe(diags)
    })

    it('diagnosticSquiggles 生成 mark class', () => {
        let state = EditorState.create({
            doc: 'abcdefghij',
            extensions: [diagnosticsField],
        })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([
                { from: 2, to: 5, severity: 'error', message: 'e' },
                { from: 6, to: 8, severity: 'warning', message: 'w' },
                { from: 0, to: 0, severity: 'info', message: 'empty' }, // 零宽跳过
            ]),
        }))
        const set = diagnosticSquiggles(state)
        const ranges: { from: number, to: number, cls?: string }[] = []
        set.between(0, state.doc.length, (from, to, value) => {
            ranges.push({ from, to, cls: (value as MarkDecoration).attrs?.class })
        })
        expect(ranges).toHaveLength(2)
        expect(ranges[0]).toMatchObject({ from: 2, to: 5 })
        expect(ranges[0].cls).toContain('error')
        expect(ranges[1].cls).toContain('warning')
    })

    it('越界 clamp 到 doc', () => {
        let state = EditorState.create({
            doc: 'ab',
            extensions: [diagnosticsField],
        })
        state = state.applyTransaction(state.update({
            effects: setDiagnostics.of([
                { from: -10, to: 100, severity: 'error', message: 'x' },
            ]),
        }))
        const set = diagnosticSquiggles(state)
        let hit = false
        set.between(0, 2, (from, to) => {
            expect(from).toBe(0)
            expect(to).toBe(2)
            hit = true
        })
        expect(hit).toBe(true)
    })

    it('空诊断 → empty set', () => {
        const state = EditorState.create({
            doc: 'x',
            extensions: [diagnosticsField],
        })
        const set = diagnosticSquiggles(state)
        let n = 0
        set.between(0, 1, () => { n++ })
        expect(n).toBe(0)
    })
})

describe('tsDiagnosticsSession', () => {
    it('挂上后把 LS 诊断写入 field', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'const x: number = "nope"\n',
                extensions: [diagnosticsField],
            }),
            parent: host,
        })
        const off = tsDiagnosticsSession(view, {
            lang: 'typescript',
            fileName: '/diag-sess.ts',
            debounceMs: 1,
        })
        const deadline = Date.now() + 20_000
        while (Date.now() < deadline) {
            const d = view.state.field(diagnosticsField)
            if (d.some(x => x.source === 'ts')) break
            await new Promise(r => setTimeout(r, 40))
        }
        const d = view.state.field(diagnosticsField)
        expect(d.some(x => x.source === 'ts' && x.to > x.from)).toBe(true)
        off()
        view.destroy()
        host.remove()
    }, 60_000)
})

describe('goToNext/PrevProblem', () => {
    function mk() {
        let state = EditorState.create({
            doc: 'abcdefghij',
            selection: EditorSelection.single(0),
            extensions: [diagnosticsField],
        })
        const dispatch = (tr: import('../../src/core/model/state').Transaction) => { state = tr.apply() }
        dispatch(state.update({
            effects: setDiagnostics.of([
                { from: 2, to: 4, severity: 'error', message: 'a' },
                { from: 7, to: 9, severity: 'warning', message: 'b' },
            ]),
        }))
        return {
            get state() { return state },
            run(cmd: typeof goToNextProblem) { return cmd({ state, dispatch }) },
        }
    }

    it('next 从光标后跳到第一处，末条再 next 环回', () => {
        const e = mk()
        expect(e.run(goToNextProblem)).toBe(true)
        expect(e.state.selection.main.from).toBe(2)
        expect(e.run(goToNextProblem)).toBe(true)
        expect(e.state.selection.main.from).toBe(7)
        expect(e.run(goToNextProblem)).toBe(true)
        expect(e.state.selection.main.from).toBe(2)
    })

    it('prev 环到最后一处', () => {
        const e = mk()
        expect(e.run(goToPrevProblem)).toBe(true)
        expect(e.state.selection.main.from).toBe(7)
    })

    it('无诊断返 false', () => {
        let state = EditorState.create({ doc: 'x', extensions: [diagnosticsField] })
        expect(goToNextProblem({ state, dispatch: () => {} })).toBe(false)
        expect(goToPrevProblem({ state, dispatch: () => {} })).toBe(false)
    })
})
