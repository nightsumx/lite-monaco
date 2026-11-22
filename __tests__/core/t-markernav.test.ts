// MarkerNavigationWidget:F8 / Alt+F8 标记导航浮窗
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { diagnosticsField, goToNextProblem, goToPrevProblem, setDiagnostics } from '../../src/core/feature/diagnostics'
import type { Diagnostic } from '../../src/core/chrome/ruler'
import {
    closeMarkersNavigation, listMarkers, markerNavigationExtension, markersNavigationVisible, navigateMarker, showMarkerAt,
} from '../../src/lang/markernav'

const doc = 'line one\nline two\nline three\nline four\n'
const at = (n: number) => doc.indexOf(`line ${n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : 'four'}`)
const D = (line: number, severity: Diagnostic['severity'], message: string, extra: Partial<Diagnostic> = {}): Diagnostic =>
    ({ from: at(line), to: at(line) + 4, severity, message, ...extra })

function setup(diags: Diagnostic[], head = 0) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({
        state: EditorState.create({ doc, selection: { anchor: head }, extensions: [diagnosticsField, markerNavigationExtension({ title: () => 'a.ts' })] }),
        parent: host,
    })
    view.dispatch(view.state.update({ effects: setDiagnostics.of(diags) }))
    return { view, done: () => { view.destroy(); host.remove() } }
}
const widget = () => document.querySelector('.cm-marker-nav') as HTMLElement | null
const meta = () => widget()!.querySelector('.cm-peek-meta')!.textContent
const msg = () => widget()!.querySelector('.cm-marker-nav-message')!.textContent

afterEach(() => { document.querySelectorAll('.cm-marker-nav').forEach(n => n.remove()) })

describe('listMarkers 排序(Monaco MarkerList,独立编辑器无 problems.sortOrder → 严重级优先)', () => {
    it('error → warning → info,同级按位置;hint 不在内', () => {
        const l = listMarkers([D(1, 'info', 'i1'), D(3, 'error', 'e3'), D(2, 'warning', 'w2'), D(2, 'error', 'e2'), { from: 0, to: 1, severity: 'hint' as never, message: 'h' }])
        expect(l.map(m => m.d.message)).toEqual(['e2', 'e3', 'w2', 'i1'])
    })
})

describe('F8 / Alt+F8 → 浮窗', () => {
    const diags = [D(1, 'error', 'first error', { source: 'ts', code: '2322' }), D(3, 'warning', 'a warning'), D(4, 'error', 'second error\nwith two lines')]
    it('首次:从光标位置找下一个标记(严重级排序后的第一条够得着的),标题 "n of m problems",source(code) 显示', () => {
        const s = setup(diags, 0)
        expect(goToNextProblem(s.view)).toBe(true)
        expect(markersNavigationVisible(s.view)).toBe(true)
        expect(widget()).not.toBeNull()
        // 光标在 0,标记按 [e@1, e@4, w@3] 排;光标在 line1 标记内 → 选第 1 条
        expect(msg()).toContain('first error')
        expect(meta()).toBe('1 of 3 problems')
        expect(widget()!.querySelector('.cm-peek-filename')!.textContent).toBe('a.ts')
        expect(widget()!.querySelector('.cm-marker-nav-source')!.textContent).toBe('ts')
        expect(widget()!.querySelector('.cm-marker-nav-code')!.textContent).toBe('(2322)')
        expect(widget()!.classList.contains('cm-marker-nav-error')).toBe(true)
        expect(s.view.state.selection.main.head).toBe(at(1))
        expect(s.view.state.selection.main.empty).toBe(true) // 光标收到起点,不选区
        s.done()
    })
    it('再按:下一条;绕回;上一条', () => {
        const s = setup(diags, 0)
        goToNextProblem(s.view)
        goToNextProblem(s.view)
        expect(msg()).toContain('second error')
        expect(meta()).toBe('2 of 3 problems')
        expect(s.view.state.selection.main.head).toBe(at(4))
        goToNextProblem(s.view)
        expect(msg()).toContain('a warning')
        expect(widget()!.classList.contains('cm-marker-nav-warning')).toBe(true)
        goToNextProblem(s.view)
        expect(meta()).toBe('1 of 3 problems')
        goToPrevProblem(s.view)
        expect(meta()).toBe('3 of 3 problems')
        s.done()
    })
    it('多行消息:每行一个 div;source(code) 跟在最后一行', () => {
        const s = setup([diags[2]].map(d => ({ ...d, source: 'ts', code: '1' })), 0)
        goToNextProblem(s.view)
        const lines = widget()!.querySelectorAll('.cm-marker-nav-message > div')
        expect(lines.length).toBe(2)
        expect(lines[0].textContent).toBe('second error')
        expect(lines[1].querySelector('.cm-marker-nav-details')).not.toBeNull()
        expect(meta()).toBe('1 of 1 problem')
        s.done()
    })
    it('Esc 关(closeMarkersNavigation);浮窗没开时 Esc 不被吃', () => {
        const s = setup(diags, 0)
        const esc = () => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); s.view.dom.dispatchEvent(e); return e }
        expect(esc().defaultPrevented).toBe(false)
        goToNextProblem(s.view)
        expect(esc().defaultPrevented).toBe(true)
        expect(widget()).toBeNull()
        expect(markersNavigationVisible(s.view)).toBe(false)
        s.done()
    })
    it('Shift+Esc 也关;标题栏 × 关;closeMarkersNavigation() 返回是否真关了', () => {
        const s = setup(diags, 0)
        goToNextProblem(s.view)
        s.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, bubbles: true, cancelable: true }))
        expect(widget()).toBeNull()
        goToNextProblem(s.view)
        ;(widget()!.querySelector('.cm-peek-close') as HTMLElement).click()
        expect(widget()).toBeNull()
        expect(closeMarkersNavigation(s.view)).toBe(false)
        s.done()
    })
    it('标题栏 ↓ ↑ 按钮', () => {
        const s = setup(diags, 0)
        goToNextProblem(s.view)
        ;(widget()!.querySelector('.cm-marker-nav-next') as HTMLElement).click()
        expect(meta()).toBe('2 of 3 problems')
        ;(widget()!.querySelector('.cm-marker-nav-prev') as HTMLElement).click()
        expect(meta()).toBe('1 of 3 problems')
        s.done()
    })
    it('没有标记:返回 false,不开浮窗', () => {
        const s = setup([], 0)
        expect(goToNextProblem(s.view)).toBe(false)
        expect(widget()).toBeNull()
        s.done()
    })
    it('标记集变化:浮窗位置上还有标记 → 更新内容;没有了 → 标灰 stale', () => {
        const s = setup(diags, 0)
        goToNextProblem(s.view)
        s.view.dispatch(s.view.state.update({ effects: setDiagnostics.of([D(1, 'error', 'changed message')]) }))
        expect(msg()).toContain('changed message')
        expect(widget()!.classList.contains('stale')).toBe(false)
        s.view.dispatch(s.view.state.update({ effects: setDiagnostics.of([D(3, 'error', 'elsewhere')]) }))
        expect(widget()!.classList.contains('stale')).toBe(true)
        s.done()
    })
    it('光标挪出选中标记后,F8 从光标位置重新找', () => {
        const s = setup(diags, 0)
        goToNextProblem(s.view) // 1 of 3(error@line1)
        s.view.dispatch(s.view.state.update({ selection: { anchor: at(4) + 1 } })) // 挪到 line four(第二条 error 里)
        goToNextProblem(s.view)
        // 重新按光标位置找:光标就在 second error 里 → 选中它(而不是接着 1 → 2)
        expect(msg()).toContain('second error')
        expect(meta()).toBe('2 of 3 problems')
        s.done()
    })
    it('相关位置:同文件的可点,点了关浮窗并跳过去', () => {
        const d = D(1, 'error', 'with related', { related: [{ file: 'a.ts', line: 4, col: 2, message: 'declared here', same: true }] })
        const s = setup([d], 0)
        goToNextProblem(s.view)
        const a = widget()!.querySelector('.cm-marker-nav-filename') as HTMLElement
        expect(a.textContent).toBe('a.ts(4, 2): ')
        a.click()
        expect(widget()).toBeNull()
        expect(s.view.state.selection.main.head).toBe(at(4) + 1)
        s.done()
    })
    it('showMarkerAt:在指定位置的标记上开浮窗', () => {
        const s = setup(diags, 0)
        expect(showMarkerAt(s.view, at(3))).toBe(true)
        expect(msg()).toContain('a warning')
        s.done()
    })
    it('没装扩展(裸 state):退回选中下一条诊断', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const view = new EditorView({ state: EditorState.create({ doc, extensions: [diagnosticsField] }), parent: host })
        view.dispatch(view.state.update({ effects: setDiagnostics.of(diags) }))
        expect(goToNextProblem(view)).toBe(true)
        expect(widget()).toBeNull()
        // 旧行为:按位置选中光标后的下一条(整段选中)
        expect(view.state.selection.main.from).toBe(at(3))
        expect(view.state.selection.main.to).toBe(at(3) + 4)
        view.destroy(); host.remove()
    })
    it('navigateMarker 直接调用', () => {
        const s = setup(diags, 0)
        expect(navigateMarker(s.view, true)).toBe(true)
        expect(navigateMarker(s.view, false)).toBe(true)
        expect(meta()).toBe('3 of 3 problems')
        s.done()
    })
})
