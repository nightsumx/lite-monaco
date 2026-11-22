// 无障碍对齐 Monaco(浏览器差分里 a11y 一线的固化)。
// 对照:Monaco screenReaderSupport._updateDomAttributes / setAriaOptions、view.ts(role=code)、
//       base/browser/ui/aria(alert/status 双容器)、suggestWidget accessibilityProvider、messageController。
// 这里只验 DOM 上的 ARIA 属性与播报容器;真读屏软件(VoiceOver/NVDA/JAWS)的实际播报无法在 jsdom 里验。
import { afterEach, describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import type { IEditorOptions } from '../../src/core/options'
import { Compartment, EditorState } from '../../src/core/model/state'
import { EditorView } from '../../src/core/view/editorview'
import { editorOptions } from '../../src/core/options'
import { a11ySession, alert, announce, setActiveDescendant, status, screenReaderLabel } from '../../src/core/feature/a11y'
import { suggestAriaLabel } from '../../src/core/feature/suggestwidget'
import { showReadOnlyMessage } from '../../src/core/feature/readonlymessage'

const hl = () => ({
    codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
    getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
}) as unknown as ShikiLike
const QUIET = { minimap: false, overviewRuler: false, vScrollbar: false, hScrollbar: false, stickyScroll: false } as const
const mounted: Array<() => void> = []
function mk(doc: string, options: IEditorOptions = {}) {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = liteMonaco({ parent, highlighter: hl(), doc, lang: 'text', features: QUIET, options })
    mounted.push(() => { view.destroy(); parent.remove() })
    return view
}
afterEach(() => { while (mounted.length) mounted.pop()!(); document.querySelectorAll('.cm-readonly-message').forEach(n => n.remove()) })

const attr = (v: EditorView, n: string) => v.contentDOM.getAttribute(n)
const frame = () => new Promise<void>(r => setTimeout(r, 30))

describe('textbox 属性 = Monaco screenReaderSupport._updateDomAttributes', () => {
    it('默认:role/aria-required/multiline/autocomplete/haspopup/roledescription/label/autocomplete=off', () => {
        const v = mk('x')
        expect(attr(v, 'role')).toBe('textbox')
        expect(attr(v, 'aria-required')).toBe('false')
        expect(attr(v, 'aria-multiline')).toBe('true')
        expect(attr(v, 'aria-autocomplete')).toBe('both')
        // 同 Monaco:补全没开过就没有 aria-haspopup
        expect(v.contentDOM.hasAttribute('aria-haspopup')).toBe(false)
        expect(attr(v, 'aria-roledescription')).toBe('editor')
        expect(attr(v, 'aria-label')).toBe('Editor content')
        expect(attr(v, 'autocomplete')).toBe('off')
    })
    it('外层 role=code(application 会让读屏进入应用模式),没有 aria-label', () => {
        const v = mk('x')
        expect(v.dom.getAttribute('role')).toBe('code')
        expect(v.dom.hasAttribute('aria-label')).toBe(false)
    })
    it('ariaRequired → aria-required=true', () => {
        expect(attr(mk('x', { ariaRequired: true }), 'aria-required')).toBe('true')
    })
    it('readOnly → aria-autocomplete=none', () => {
        expect(attr(mk('x', { readOnly: true }), 'aria-autocomplete')).toBe('none')
    })
    it('ariaLabel 选项写进 textbox', () => {
        expect(attr(mk('x', { ariaLabel: 'My editor' }), 'aria-label')).toBe('My editor')
    })
    it('accessibilitySupport:off → 标签换成「编辑器此时不可访问」;auto/on 用 ariaLabel', () => {
        expect(attr(mk('x', { accessibilitySupport: 'off' }), 'aria-label')).toBe('The editor is not accessible at this time.')
        expect(attr(mk('x', { accessibilitySupport: 'on' }), 'aria-label')).toBe('Editor content')
        expect(attr(mk('x', { accessibilitySupport: 'auto' }), 'aria-label')).toBe('Editor content')
        expect(screenReaderLabel(mk('x', { accessibilitySupport: 'off', ariaLabel: 'zzz' }))).toBe('The editor is not accessible at this time.')
    })
    it('运行时改选项:下一个事务就同步(ariaRequired / readOnly / accessibilitySupport)', () => {
        const comp = new Compartment()
        const parent = document.createElement('div'); document.body.appendChild(parent)
        const view = new EditorView({ state: EditorState.create({ doc: 'x', extensions: [comp.of(editorOptions.of({}))] }), parent })
        const off = a11ySession(view)
        const set = (o: IEditorOptions) => view.dispatch(view.state.update({ effects: comp.reconfigure(editorOptions.of(o)) }))
        set({ ariaRequired: true }); expect(attr(view, 'aria-required')).toBe('true')
        set({ readOnly: true }); expect(attr(view, 'aria-autocomplete')).toBe('none')
        set({ accessibilitySupport: 'off' }); expect(attr(view, 'aria-label')).toBe('The editor is not accessible at this time.')
        set({}); expect(attr(view, 'aria-label')).toBe('Editor content'); expect(attr(view, 'aria-required')).toBe('false'); expect(attr(view, 'aria-autocomplete')).toBe('both')
        off(); view.destroy(); parent.remove()
    })
})

describe('补全列表:setAriaOptions({activeDescendant})', () => {
    it('有选中项 → haspopup=true + autocomplete=list + activedescendant;清掉 → false / both', () => {
        const v = mk('x')
        setActiveDescendant(v, 'cm-completion-1-0')
        expect(attr(v, 'aria-activedescendant')).toBe('cm-completion-1-0')
        expect(attr(v, 'aria-haspopup')).toBe('true')
        expect(attr(v, 'aria-autocomplete')).toBe('list')
        setActiveDescendant(v, undefined)
        expect(v.contentDOM.hasAttribute('aria-activedescendant')).toBe(false)
        expect(attr(v, 'aria-haspopup')).toBe('false')
        expect(attr(v, 'aria-autocomplete')).toBe('both')
    })
    it('选项名 = Monaco getAriaLabel:label, Kind / label detail, Kind / label, description, Kind', () => {
        const row = { label: 'alpha', kind: 'text', deprecated: false, matches: [] as number[] }
        expect(suggestAriaLabel(row)).toBe('alpha, Text')
        expect(suggestAriaLabel({ ...row, kind: 'function', labelDetail: '(x)' })).toBe('alpha (x), Function')
        expect(suggestAriaLabel({ ...row, kind: 'function', labelDescription: 'lib' })).toBe('alpha, lib, Function')
        expect(suggestAriaLabel({ ...row, kind: 'method', labelDetail: '(x)', labelDescription: 'lib' })).toBe('alpha (x), lib, Method')
    })
})

describe('播报容器 = Monaco base/browser/ui/aria', () => {
    const box = (v: EditorView) => v.dom.querySelector('[data-cm-a11y-live]') as HTMLElement
    it('2 × role=alert(aria-atomic)+ 2 × aria-live=polite(aria-atomic)', () => {
        const v = mk('x')
        alert(v, 'a')
        const c = box(v)
        const alerts = [...c.querySelectorAll('[role=alert]')]
        const polite = [...c.querySelectorAll('[aria-live=polite]')]
        expect(alerts).toHaveLength(2)
        expect(polite).toHaveLength(2)
        for (const e of [...alerts, ...polite]) expect(e.getAttribute('aria-atomic')).toBe('true')
    })
    it('alert 写 alert 容器,status/announce 写 polite 容器,互不串', () => {
        const v = mk('x')
        alert(v, 'boom'); status(v, 'fine')
        const c = box(v)
        expect([...c.querySelectorAll('[role=alert]')].map(e => e.textContent)).toContain('boom')
        expect([...c.querySelectorAll('[aria-live=polite]')].map(e => e.textContent)).toContain('fine')
        expect([...c.querySelectorAll('[role=alert]')].map(e => e.textContent)).not.toContain('fine')
        announce(v, 'again')
        expect([...c.querySelectorAll('[aria-live=polite]')].map(e => e.textContent)).toContain('again')
    })
    it('重复消息换另一个容器写,另一个清空(读屏才会再读一遍)', () => {
        const v = mk('x')
        const pair = () => [...box(v).querySelectorAll('[role=alert]')] as HTMLElement[]
        alert(v, 'same')
        const [a, b] = pair()
        expect(a.textContent).toBe('same'); expect(b.textContent).toBe('')
        alert(v, 'same')
        expect(a.textContent).toBe(''); expect(b.textContent).toBe('same')
        alert(v, 'same')
        expect(a.textContent).toBe('same'); expect(b.textContent).toBe('')
    })
    it('消息最多 20000 字(Monaco #94233)', () => {
        const v = mk('x')
        alert(v, 'x'.repeat(30000))
        expect((box(v).querySelector('[role=alert]') as HTMLElement).textContent!.length).toBe(20000)
    })
    it('旧的容器不是 status role:没有 role=status', () => {
        const v = mk('x')
        expect(v.dom.querySelector('[role=status]')).toBeNull()
    })
})

describe('命令结果走 alert(Monaco 用 aria.alert 的地方)', () => {
    it('只读提示:朗读进 alert 容器,浮层自己不带 role(否则读两遍)', () => {
        const v = mk('x', { readOnly: true })
        showReadOnlyMessage(v)
        const tip = document.querySelector('.cm-readonly-message')!
        expect(tip.getAttribute('role')).toBeNull()
        const spoken = [...v.dom.querySelectorAll('[role=alert]')].map(e => e.textContent).join('|')
        expect(spoken).toContain('Cannot edit in read-only editor')
    })
    it('Tab 键焦点模式开关(toggleTabFocusMode)的播报在 alert 容器', async () => {
        const v = mk('x')
        const { toggleTabFocusModeAnnounced } = await import('../../src/core/feature/a11y')
        const { tabFocusMoves, toggleTabFocusMode } = await import('../../src/core/edit/commands')
        toggleTabFocusModeAnnounced(v)
        await frame()
        expect([...v.dom.querySelectorAll('[role=alert]')].map(e => e.textContent).join('|')).toContain('Pressing Tab will now move focus')
        if (tabFocusMoves()) toggleTabFocusMode(v)
    })
})

describe('查找框 / 标记导航', () => {
    it('查找框的展开按钮带 aria-expanded(随替换行开合)', async () => {
        const v = mk('line one')
        v.focus()
        const { openSearch, toggleSearchReplace } = await import('../../src/core/feature/search')
        openSearch(v)
        await frame()
        const btn = v.dom.querySelector('.cm-find-toggle-replace')!
        expect(btn.getAttribute('aria-expanded')).toBe('false')
        toggleSearchReplace(v)
        await frame()
        expect(btn.getAttribute('aria-expanded')).toBe('true')
    })
})
