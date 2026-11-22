// 宿主接入面(多 tab 编辑器宿主,如 Filo):state 复用、非撤销的外部改动、宿主 keymap、
// 每个 view 一份 token 缓存、主题 style 顺序、TS 装饰确实装上。
import { describe, expect, it } from 'vitest'
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike } from '../../src/litemonaco'
import * as core from '../../src/core/index'
import { cachedLines, selectTokenCache, sharedTokens } from '../../src/core/view/tokens'
import { undo } from '../../src/core/edit/history'
import { inlayDecorationsFromField } from '../../src/lang/tsinlay'
import { highlightDecorations } from '../../src/lang/tshighlight'

/** Colours every line by its first letter, and records the themes it was asked for. */
function fakeHl(themes: string[] = []): ShikiLike {
    return {
        codeToTokens: (code: string, o: { theme: string }) => {
            themes.push(o.theme)
            return { tokens: [[{ content: code, offset: 0, color: code ? `#${code[0].charCodeAt(0).toString(16).padStart(2, '0')}0000` : undefined }]] }
        },
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['typescript', 'text'],
        getTheme: (name?: string) => name && name.includes('light')
            ? { bg: '#ffffff', fg: '#000000', type: 'light' as const }
            : { bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const },
    } as unknown as ShikiLike
}

const QUIET = { minimap: false, autocomplete: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

function host() {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    return parent
}

function type(view: core.EditorView, text: string, at = view.state.doc.length) {
    view.dispatch(view.state.update({ changes: { from: at, insert: text }, userEvent: 'input.type' }))
}

describe('lite-monaco 宿主接入', () => {
    it('plaintext / text 不上彩虹括号(Monaco 该语言没有 brackets),typescript 上', () => {
        const parent = host()
        const marks = (lang: string) => {
            const view = liteMonaco({ parent, highlighter: fakeHl(), doc: '(a)', lang, features: QUIET })
            const styles = [...view.contentDOM.querySelectorAll('[style]')].map(el => el.getAttribute('style') ?? '')
            view.destroy()
            // jsdom 把 #FFD700 / #DA70D6 / #179FFF 归一成 rgb
            return styles.filter(s => s.includes('rgb(255, 215, 0)') || s.includes('rgb(218, 112, 214)') || s.includes('rgb(23, 159, 255)'))
        }
        expect(marks('plaintext')).toEqual([])
        expect(marks('text')).toEqual([])
        expect(marks('typescript').length).toBeGreaterThan(0)
    })

    it('state 复用:destroy 后 liteMonaco({ state }) 保留文档、选区和撤销历史', () => {
        const parent = host()
        const a = liteMonaco({ parent, highlighter: fakeHl(), doc: 'abc', lang: 'text', features: QUIET })
        type(a, 'X')
        a.dispatch(a.state.update({ selection: { anchor: 2 } }))
        const saved = a.state
        a.destroy()

        const b = liteMonaco({ parent, highlighter: fakeHl(), state: saved, doc: 'ignored', lang: 'text', features: QUIET })
        expect(b.state.doc.toString()).toBe('abcX')
        expect(b.state.selection.main.head).toBe(2)
        undo(b)
        expect(b.state.doc.toString()).toBe('abc')
        b.destroy()
        parent.remove()
    })

    it('换主题:复用 state 重建,新装饰用新主题,历史仍在', () => {
        const parent = host()
        const themes: string[] = []
        const hl = fakeHl(themes)
        const a = liteMonaco({ parent, highlighter: hl, doc: 'one\ntwo', lang: 'typescript', theme: 'dark-plus', features: QUIET })
        type(a, '!')
        const saved = a.state
        a.destroy()
        themes.length = 0
        const b = liteMonaco({ parent, highlighter: hl, state: saved, lang: 'typescript', theme: 'light-plus', features: QUIET })
        expect(themes.length).toBeGreaterThan(0)
        expect(new Set(themes)).toEqual(new Set(['light-plus']))
        undo(b)
        expect(b.state.doc.toString()).toBe('one\ntwo')
        b.destroy()
        parent.remove()
    })

    it('不是 lite-monaco 建的 state 也能接:取它的 doc 和选区重建', () => {
        const parent = host()
        const plain = core.EditorState.create({ doc: 'hello', selection: { anchor: 3 } })
        const view = liteMonaco({ parent, highlighter: fakeHl(), state: plain, lang: 'text', features: QUIET })
        expect(view.state.doc.toString()).toBe('hello')
        expect(view.state.selection.main.head).toBe(3)
        type(view, '!')
        undo(view)
        expect(view.state.doc.toString()).toBe('hello')
        view.destroy()
        parent.remove()
    })

    it('Transaction 是值导出:addToHistory=false 的外部改动不进撤销', () => {
        const parent = host()
        const view = liteMonaco({ parent, highlighter: fakeHl(), doc: 'base\n', lang: 'text', features: QUIET })
        type(view, 'mine', 0)
        // 磁盘上别人追加了一行:映射进历史,但自己不可撤销
        view.dispatch(view.state.update({
            changes: { from: view.state.doc.length, insert: 'agent\n' },
            annotations: [core.Transaction.addToHistory.of(false), core.Transaction.remote.of(true)],
        }))
        expect(view.state.doc.toString()).toBe('minebase\nagent\n')
        undo(view)
        expect(view.state.doc.toString()).toBe('base\nagent\n')
        view.destroy()
        parent.remove()
    })

    it('宿主 keymap 排在内置之前;run 返回 false 落到内置', () => {
        const parent = host()
        let saved = 0
        const view = liteMonaco({
            parent,
            highlighter: fakeHl(),
            doc: 'x',
            lang: 'text',
            features: { ...QUIET, tabIndent: true },
            keymap: [
                { key: 'Mod-s', run: () => (saved++, true) },
                { key: 'Tab', run: () => false },
            ],
        })
        const mac = /Mac|iPhone|iPad/.test(navigator.platform)
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', keyCode: 83, metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }))
        expect(saved).toBe(1)
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }))
        expect(view.state.doc.toString()).toBe(`${view.state.indentUnit}x`)
        view.destroy()
        parent.remove()
    })

    it('token 缓存按 view 分开:同行数的另一篇文档改动不串色', () => {
        const parent = host()
        const hl = fakeHl()
        const a = liteMonaco({ parent, highlighter: hl, doc: 'aaa\nbbb', lang: 'typescript', features: QUIET })
        const b = liteMonaco({ parent, highlighter: hl, doc: 'xxx\nyyy', lang: 'typescript', features: QUIET })
        // b 在后台收到同行数的改动(比如磁盘更新),a 的缓存不受影响
        b.dispatch(b.state.update({ changes: { from: 0, to: 3, insert: 'zzz' } }))
        selectTokenCache(a)
        expect(cachedLines()).toEqual(['aaa', 'bbb'])
        selectTokenCache(b)
        expect(cachedLines()).toEqual(['zzz', 'yyy'])
        // a 继续编辑,高亮按 a 自己的行增量更新
        a.dispatch(a.state.update({ changes: { from: 0, to: 1, insert: 'c' } }))
        selectTokenCache(a)
        expect(cachedLines()).toEqual(['caa', 'bbb'])
        a.destroy()
        b.destroy()
        parent.remove()
    })

    it('无 view 的调用落默认缓存,不碰 view 的缓存', () => {
        const parent = host()
        const hl = fakeHl()
        const a = liteMonaco({ parent, highlighter: hl, doc: 'aaa', lang: 'typescript', features: QUIET })
        selectTokenCache(null)
        sharedTokens(hl, 'other', { lang: 'typescript', theme: 'dark-plus' })
        selectTokenCache(a)
        expect(cachedLines()).toEqual(['aaa'])
        a.destroy()
        parent.remove()
    })

    it('主题:明→暗→明 重挂后颜色跟最后一次(变量按实例,不靠 style 顺序)', () => {
        const parent = host()
        const hl = fakeHl()
        let last = ''
        for (const theme of ['light-plus', 'dark-plus', 'light-plus']) {
            const v = liteMonaco({ parent, highlighter: hl, doc: 'x', lang: 'text', theme, features: QUIET })
            last = v.dom.style.getPropertyValue('--lm-editor-background')
            v.destroy()
        }
        expect(last).toBe('#ffffff')
        parent.remove()
    })

    it('TS 文件装上 inlay hints(features.inlayHints 开时;默认关对齐 Monaco)与同名高亮装饰(以前 push 晚了不生效)', () => {
        const parent = host()
        const view = liteMonaco({ parent, highlighter: fakeHl(), doc: 'const a = 1', lang: 'typescript', features: { ...QUIET, inlayHints: true }, fileName: '/repo/a.ts' })
        const sources = view.state.facet(core.decorations)
        expect(sources).toContain(inlayDecorationsFromField)
        expect(sources).toContain(highlightDecorations)
        view.destroy()
        parent.remove()
    })
})
