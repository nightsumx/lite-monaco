// @vitest-environment jsdom
// 关掉编辑器后不能再留着它的 token 缓存:模块级的“当前缓存”指针(tokens.ts 的 c)原来一直指着最后用过的那份,
// 关掉 10 万行的文件后约 40 MB 还挂在上面,直到另一个编辑器选了别的缓存才放。
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { liteMonaco } from '../../src/litemonaco'
import { cachedLines, selectTokenCache } from '../../src/core/view/tokens'
import type { EditorView } from '../../src/core/view/editorview'

let hl: Highlighter
beforeAll(async () => { hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) })
afterEach(() => selectTokenCache(null))

const doc = Array.from({ length: 300 }, (_, i) => `const v${i} = { a: ${i}, b: "x${i}" }`).join('\n')
const mount = () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    return liteMonaco({
        parent, highlighter: hl as never, doc, lang: 'typescript', theme: 'dark-plus',
        features: { autocomplete: false, signatureHelp: false, hover: false, codeActions: false, tsDiagnostics: false },
    }) as unknown as EditorView
}

describe('销毁编辑器释放 token 缓存', () => {
    it('活着时缓存有内容,destroy 后当前缓存是空的', () => {
        const view = mount()
        view.dispatch(view.state.update({ changes: { from: 0, insert: 'x' } }))
        expect(cachedLines(), '活着时应有缓存(否则这条测试没意义)').not.toBeNull()
        view.destroy()
        expect(cachedLines()).toBeNull()
    })
    it('销毁的是另一个编辑器时不动当前这个的缓存', () => {
        const a = mount()
        const b = mount()
        b.dispatch(b.state.update({ changes: { from: 0, insert: 'y' } }))
        a.dispatch(a.state.update({ changes: { from: 0, insert: 'x' } }))
        a.destroy()
        // b 还活着:它的缓存必须还在、也还能继续用
        b.dispatch(b.state.update({ changes: { from: 0, insert: 'z' } }))
        expect(b.state.doc.line(1).text.startsWith('z')).toBe(true)
        b.destroy()
        expect(cachedLines()).toBeNull()
    })
})
