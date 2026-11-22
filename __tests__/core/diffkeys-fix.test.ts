// 第五轮 O 组:diff 编辑器的替换键照主编辑器(Monaco StartFindReplaceAction):Mac ⌥⌘F,Win/Linux Ctrl+H。
// Mac 上 ⌘H 是系统的隐藏应用,不绑。平台要在 diffeditor 模块加载前定好,用动态 import。
import { describe, expect, it } from 'vitest'
import { setMacPlatform } from './f5-replay'
import type { ShikiLike } from '../../src/litemonaco'

setMacPlatform()
const { DiffEditor } = await import('../../src/diffeditor')
const { searchField } = await import('../../src/core/feature/search')

function fakeHl(): ShikiLike {
    return {
        codeToTokens: () => ({ tokens: [[]], fg: '#fff', bg: '#000' }),
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}

function press(target: Element, key: string, init: KeyboardEventInit) {
    const e = new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e
}

describe('diff 编辑器替换键(Mac)', () => {
    it('⌘H 不开替换', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const d = new DiffEditor({ parent, highlighter: fakeHl(), lang: 'text', original: 'a\nb', modified: 'a\nc' })
        const v = d.modifiedView
        press(v.contentDOM, 'h', { metaKey: true })
        expect(v.state.field(searchField, false)?.replaceOpen ?? false).toBe(false)
        d.destroy()
        parent.remove()
    })

    it('⌥⌘F 开替换', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const d = new DiffEditor({ parent, highlighter: fakeHl(), lang: 'text', original: 'a\nb', modified: 'a\nc' })
        const v = d.modifiedView
        press(v.contentDOM, 'ƒ', { metaKey: true, altKey: true, code: 'KeyF' })
        expect(v.state.field(searchField, false)?.replaceOpen).toBe(true)
        d.destroy()
        parent.remove()
    })
})
