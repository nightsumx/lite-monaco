// 补全细节(resolve)可异步(语言服务在 Worker 里):先无细节显示、到了刷新;接受时细节没到:主编辑先落,附加编辑等到了再施加,
// 期间文档在附加编辑之前改了就放弃(Monaco SuggestController._insertSuggestion)。走真实路径:provider → SuggestModel → SuggestUi / SuggestController。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuggest, cleanupSuggest } from './_suggest-harness'
import type { CompletionItemM } from '../../src/lang/providers'

afterEach(cleanupSuggest)

type Resolved = Partial<CompletionItemM> | null
function deferred() {
    let done!: (r: Resolved) => void
    const p = new Promise<Resolved>(r => { done = r })
    return { p, done }
}
const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 }

async function mount(resolve: () => Promise<Resolved>) {
    const r = mountSuggest({
        doc: 'foo',
        providers: [['plaintext', {
            provideCompletionItems: () => ({ suggestions: [{ label: 'foobar', kind: 4, insertText: 'foobar', range }] }),
            resolveCompletionItem: item => resolve().then(x => x ? { ...item, ...x } as CompletionItemM : item),
        }]],
    })
    r.trigger()
    await r.waitOpen()
    return r
}

describe('异步 resolve', () => {
    it('第一次取无细节并发请求(只发一次),到了之后取到并回调 onReady 一次', async () => {
        const d = deferred()
        const resolve = vi.fn(() => d.p)
        const r = await mount(resolve)
        const ready = vi.fn()
        expect(r.ui.host!.info(0, ready)!.detail).toBeUndefined()
        expect(r.ui.host!.info(0, ready)!.detail).toBeUndefined()
        expect(resolve).toHaveBeenCalledTimes(1)
        d.done({ detail: 'D' })
        await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1))
        expect(r.ui.host!.info(0, ready)!.detail).toBe('D')
        expect(resolve).toHaveBeenCalledTimes(1)
    })

    it('resolve 抛错/拒绝 → 当作没有细节', async () => {
        let boom!: () => void
        const r = await mount(() => new Promise<Resolved>((_, rej) => { boom = () => rej(new Error('boom')) }))
        const ready = vi.fn()
        r.ui.host!.info(0, ready)
        boom()
        await vi.waitFor(() => expect(ready).toHaveBeenCalled())
        const info = r.ui.host!.info(0, ready)!
        expect(info.detail).toBeUndefined()
        expect(info.documentation).toBeUndefined()
    })

    it('接受时细节没到:主编辑先落,等到了再带上附加编辑一起应用', async () => {
        const d = deferred()
        const r = await mount(() => d.p)
        r.ctl.acceptSelectedSuggestion(true, false)
        expect(r.doc).toBe('foobar') // 主编辑立刻落(Monaco 同),附加编辑还没来
        d.done({ additionalTextEdits: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'import x\n' }] })
        await vi.waitFor(() => expect(r.doc).toBe('import x\nfoobar'))
    })

    it('等待期间文档在附加编辑之前变了:放弃附加编辑,不拿旧位置改新文档', async () => {
        const d = deferred()
        const r = await mount(() => d.p)
        r.ctl.acceptSelectedSuggestion(true, false)
        r.v.dispatch(r.v.state.update({ changes: { from: 0, insert: 'zz' }, selection: { anchor: 8 } }))
        // 附加编辑在文末:用户在它前面改了文档(Monaco position isBefore edit.start)→ 放弃
        d.done({ additionalTextEdits: [{ range: { startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 7 }, text: 'import x\n' }] })
        await new Promise(res => setTimeout(res, 30))
        expect(r.doc).toBe('zzfoobar')
    })
})
