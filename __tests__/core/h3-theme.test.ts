// H3:defineTheme / setTheme(全局,所有实例)+ Monaco 主题数据 → shiki 主题对象。
import { describe, expect, it } from 'vitest'
import { defineTheme, setTheme, getTheme, toShikiTheme, resolveShikiThemeName, onDidColorThemeChange } from '../../src/api/themes'
import { fakeHl, mount, QUIET } from './h1-helpers'
import { liteMonaco } from '../../src/litemonaco'

/** 带 loadThemeSync / getTheme 的假高亮器:按名字存主题,没存过的给个底主题 */
function themedHl() {
    const themes = new Map<string, any>()
    const base = fakeHl() as any
    return Object.assign(base, {
        themes,
        loadThemeSync: (t: any) => { themes.set(t.name, t) },
        getLoadedThemes: () => [...themes.keys()],
        getTheme: (name: string) => themes.get(name) ?? {
            bg: name === 'light-plus' ? '#ffffff' : '#1e1e1e', fg: name === 'light-plus' ? '#000000' : '#d4d4d4',
            type: name === 'light-plus' ? 'light' : 'dark',
            colors: { 'editorCursor.foreground': '#aaaaaa' }, settings: [{ scope: 'keyword', settings: { foreground: '#569cd6' } }],
        },
    })
}

describe('H3 toShikiTheme 映射', () => {
    it('rules → settings;foreground 补 #;token "" 是默认前景;colors 原样直通;inherit 带上底主题', () => {
        const hl = themedHl()
        const t = toShikiTheme('t1', {
            base: 'vs-dark', inherit: true,
            rules: [{ token: '', foreground: 'cccccc', background: '101010' }, { token: 'comment', foreground: '00ff00', fontStyle: 'italic' }, { token: 'keyword.ts', foreground: 'ff0000' }],
            colors: { 'editor.selectionBackground': '#334455' },
        }, hl)
        expect(t.type).toBe('dark')
        expect(t.fg).toBe('#cccccc')
        expect(t.bg).toBe('#101010')
        expect(t.colors['editor.selectionBackground']).toBe('#334455')
        expect(t.colors['editorCursor.foreground']).toBe('#aaaaaa') // 来自底主题
        expect(t.settings[0]).toEqual({ settings: { foreground: '#cccccc', background: '#101010' } })
        const comment = t.settings.find(s => Array.isArray(s.scope) && s.scope.includes('comment'))!
        expect(comment.settings).toEqual({ foreground: '#00ff00', fontStyle: 'italic' })
        const kw = t.settings.find(s => Array.isArray(s.scope) && s.scope.includes('keyword.ts'))!
        expect(kw.scope).toContain('keyword')
        expect(kw.scope).toContain('storage.type')
        // inherit: false 不带底主题的 colors
        const t2 = toShikiTheme('t2', { base: 'vs', inherit: false, rules: [], colors: {} }, hl)
        expect(t2.type).toBe('light')
        expect(t2.colors['editorCursor.foreground']).toBeUndefined()
        expect(t2.settings.length).toBe(1)
    })

    it('名字 / base 校验照 Monaco;内置名翻成 shiki 主题名', () => {
        expect(() => defineTheme('bad name', { base: 'vs', inherit: false, rules: [], colors: {} })).toThrow()
        expect(() => defineTheme('vs-dark', { base: 'vs', inherit: false, rules: [], colors: {} })).toThrow()
        expect(() => defineTheme('ok-theme', { base: 'nope' as any, inherit: false, rules: [], colors: {} })).toThrow()
        expect(resolveShikiThemeName('vs')).toBe('light-plus')
        expect(resolveShikiThemeName('vs-dark')).toBe('dark-plus')
        expect(resolveShikiThemeName('hc-black')).toBe('github-dark-high-contrast')
        expect(resolveShikiThemeName('hc-light')).toBe('github-light-high-contrast')
        expect(resolveShikiThemeName('github-dark')).toBe('github-dark') // 不认识的当 shiki 主题名
    })
})

describe('H3 setTheme 全局生效', () => {
    it('defineTheme + setTheme:所有实例的颜色变量一起换;重定义当前主题立刻生效;内置名可切', () => {
        const hl = themedHl()
        const mk = () => {
            const parent = document.createElement('div')
            document.body.appendChild(parent)
            return liteMonaco({ parent, highlighter: hl, doc: 'x', lang: 'text', theme: 'vs-dark', features: { ...QUIET } })
        }
        const e1 = mk(), e2 = mk()
        const bg = (e: any) => e.dom.style.getPropertyValue('--lm-editor-background')
        expect(bg(e1)).toBe('#1e1e1e')
        const seen: string[] = []
        const d = onDidColorThemeChange(e => seen.push(e.themeName))
        defineTheme('h3-red', { base: 'vs-dark', inherit: true, rules: [{ token: 'comment', foreground: '00ff00' }], colors: { 'editor.background': '#220000' } })
        setTheme('h3-red')
        expect(getTheme()).toBe('h3-red')
        expect(bg(e1)).toBe('#220000')
        expect(bg(e2)).toBe('#220000')
        expect(hl.themes.has('h3-red')).toBe(true)
        // 重定义当前主题 → 立刻生效(新的 shiki 名,token 缓存不会拿旧的)
        defineTheme('h3-red', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#003300' } })
        expect(bg(e1)).toBe('#003300')
        expect(hl.themes.has('h3-red~1')).toBe(true)
        // 切回内置浅色
        setTheme('vs')
        expect(bg(e1)).toBe('#ffffff')
        expect(bg(e2)).toBe('#ffffff')
        expect(seen).toEqual(['h3-red', 'h3-red', 'vs'])
        // 销毁后不再被 setTheme 碰
        e2.destroy()
        setTheme('vs-dark')
        expect(bg(e1)).toBe('#1e1e1e')
        d.dispose(); e1.destroy()
    })

    it('构造时 theme 写 Monaco 内置名 / defineTheme 过的名字都能用', () => {
        const hl = themedHl()
        defineTheme('h3-init', { base: 'vs', inherit: false, rules: [], colors: { 'editor.background': '#fafafa' } })
        const { ed, done } = mount({ highlighter: hl, theme: 'h3-init' })
        expect(ed.dom.style.getPropertyValue('--lm-editor-background')).toBe('#fafafa')
        done()
    })

    // Monaco 的 setTheme 对没定义过的名字回落 'vs'。@monaco-editor/react 的 Editor / DiffEditor 不给 theme 时传的就是 'light'。
    it('不认识的主题名回落 vs(浅色);shiki 认得的名字照旧直用', () => {
        const hl = themedHl()
        for (const n of ['light-plus', 'dark-plus', 'github-dark']) hl.themes.set(n, { bg: n === 'light-plus' ? '#ffffff' : n === 'github-dark' ? '#24292e' : '#1e1e1e', fg: '#000000', type: n === 'light-plus' ? 'light' : 'dark', colors: {}, settings: [] })
        const { ed, done } = mount({ highlighter: hl, theme: 'vs-dark' })
        const bg = () => ed.dom.style.getPropertyValue('--lm-editor-background')
        expect(bg()).toBe('#1e1e1e')
        setTheme('light')
        expect(bg()).toBe('#ffffff')
        setTheme('github-dark')
        expect(bg()).toBe('#24292e')
        setTheme('vs-dark')
        done()
    })
})
