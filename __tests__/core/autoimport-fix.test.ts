// R3 修复回归:补全里别的文件的导出(auto-import),接受后插入 import,和补全本身是一步撤销。
// 旧版 getCompletionEntryDetails 不传格式选项,TS 在 ChangeTracker.fromContext 抛 TypeError,被吞成「没细节」。
// 走真实路径:liteMonaco → SuggestModel → tsCompletionProvider(resolveCompletionItem 带 additionalTextEdits)→ SuggestController 接受。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { cleanupSuggest, mountSuggest, until, type SuggestRig } from './_suggest-harness'

afterEach(cleanupSuggest)

function mount(text: string, fileName: string, files: Record<string, string>): SuggestRig {
    const caret = text.indexOf('|')
    const doc = text.slice(0, caret) + text.slice(caret + 1)
    return mountSuggest({ doc, cursor: caret, lang: 'typescript', fileName, tsFiles: files })
}

const accept = (r: SuggestRig) => {
    const before = r.doc
    r.ui.command!('accept')
    return before
}

async function pick(r: SuggestRig, label: string) {
    r.trigger()
    await until(() => r.listed && r.labels.includes(label), 20_000)
    expect(r.listed).toBe(true)
    // 走到目标项(↓ / 点选同一条焦点路径)
    r.ui.select(r.labels.indexOf(label))
    expect(r.labels[r.selected]).toBe(label)
    return r.ctl.getFocusedItem()!.item
}

describe('auto-import 补全', () => {
    it('别的文件的导出:细节带 import 编辑,接受后插到文件头', async () => {
        clearTSServiceCache()
        const v = mount('const beta = 1\nonlyIn|', '/ai/b.ts', { '/ai/a.ts': 'export const onlyInA = 42\n' })
        const item = await pick(v, 'onlyInA')
        // 细节在 Worker 里异步取:先读一次发请求,等它到了再读
        v.ui.host!.info(v.selected, () => { /* */ })
        await vi.waitFor(() => expect(item.completion.additionalTextEdits?.length).toBeGreaterThan(0))
        accept(v)
        expect(v.doc).toBe('import { onlyInA } from "./a"\n\nconst beta = 1\nonlyInA')
        // 光标留在补全的词后面
        expect(v.v.state.selection.main.head).toBe(v.doc.length)
        // 一步撤销回到接受前
        v.v.trigger('keyboard', 'undo', null)
        expect(v.doc).toBe('const beta = 1\nonlyIn')
    }, 60_000)

    it('已有 import 时按 TS 的位置插(import 按模块名排序),沿用文件里的引号', async () => {
        clearTSServiceCache()
        const v = mount("import { x } from './x'\n\nonlyIn|", '/ai2/b.ts', {
            '/ai2/a.ts': 'export const onlyInA = 42\n',
            '/ai2/x.ts': 'export const x = 1\n',
        })
        await pick(v, 'onlyInA')
        accept(v)
        // 细节没到时接受会等它到了再应用(异步),所以等文档变化
        await vi.waitFor(() => expect(v.doc).toBe("import { onlyInA } from './a'\nimport { x } from './x'\n\nonlyInA"))
    }, 60_000)

    it('同一模块已有具名导入时并进同一个花括号', async () => {
        clearTSServiceCache()
        const v = mount("import { other } from './a'\n\nother; onlyIn|", '/ai3/b.ts', {
            '/ai3/a.ts': 'export const onlyInA = 42\nexport const other = 1\n',
        })
        await pick(v, 'onlyInA')
        accept(v)
        await vi.waitFor(() => expect(v.doc).toBe("import { onlyInA, other } from './a'\n\nother; onlyInA"))
    }, 60_000)
})
