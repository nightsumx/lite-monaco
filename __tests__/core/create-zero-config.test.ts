// editor.create 零配置(同 Monaco):没传 highlighter、没 setDefaultHighlighter 也能建;shiki 懒加载,装好后补色。
import { describe, expect, it } from 'vitest'
import { createEditor } from '../../src/api/create'
import { isLazyHighlighter, lazyHighlighter } from '../../src/api/lazyhighlighter'

describe('createEditor 零配置', () => {
    it('不传高亮器不抛,编辑器可用', () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const ed = createEditor(host, { value: 'const a = 1', language: 'typescript' })
        expect(ed.getValue()).toBe('const a = 1')
        expect(isLazyHighlighter(lazyHighlighter)).toBe(true)
        ed.dispose()
    })
    it('shiki 没加载完之前高亮器是无色的:不报错、行原样', () => {
        const r = lazyHighlighter.codeToTokens('x\ny', { lang: 'typescript' })
        expect(r.tokens.length).toBeGreaterThanOrEqual(2)
    })
})
