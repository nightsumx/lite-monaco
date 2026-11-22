import { describe, expect, it } from 'vitest'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { docCommentInput } from '../../src/lang/tsdoc'
import { typeText } from './input-harness'
import { SLOW, drain, mount, spy } from './tsinput-harness'

// h-edit 体检 E3:缩进的类成员上方 `/*` 再打 `*`,原来从行首盖到下一行,缩进和换行都没了
async function expand(doc: string, fileName: string) {
    clearTSServiceCache()
    const opts = { lang: 'typescript', fileName }
    const session = getTSService(opts)
    session.update(doc)
    await session.ensure()
    const at = doc.indexOf('/*') + 2
    const h = spy(docCommentInput(opts))
    const { view, done } = mount(doc, [h.ext], { anchor: at })
    typeText(view, at, '*')
    await drain(opts)
    const syncFalse = h.results[0] === false
    const text = view.state.doc.toString()
    const head = view.state.selection.main.head
    done()
    return { syncFalse, out: text.slice(0, head) + '‸' + text.slice(head) }
}

describe('JSDoc 模板:只替换 /**,每行带当前缩进,保留原换行', () => {
    it('缩进的类成员上方', async () => {
        const r = await expand('class A {\n    /*\n    foo(a: number) {}\n}\n', '/doc-member.ts')
        expect(r.syncFalse).toBe(true) // 处理器同步返回 false,展开靠异步跟进
        expect(r.out).toBe('class A {\n    /**\n     * ‸\n     * @param a\n     */\n    foo(a: number) {}\n}\n')
    }, SLOW)

    it('顶层函数上方', async () => {
        const r = await expand('/*\nfunction foo(a, b) {}\n', '/doc-top.ts')
        expect(r.out).toBe('/**\n * ‸\n * @param a\n * @param b\n */\nfunction foo(a, b) {}\n')
    }, SLOW)
})
