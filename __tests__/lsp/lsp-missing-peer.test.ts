// peer 依赖缺失的降级:vscode-{css,html,json}-languageservice 是可选 peer,没装 / 加载失败时
// 首次用到该语言只告警一次,不抛,编辑器和高亮照常。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const CASES: [string, string, string, string][] = [
    ['css', 'vscode-css-languageservice', 'css', 'a { colr: red }'],
    ['html', 'vscode-html-languageservice', 'html', '<div></div>'],
    ['json', 'vscode-json-languageservice', 'json', '{ "a": 1,, }'],
]

describe.each(CASES)('缺 %s 语言服务', (lang, pkg, _l, text) => {
    let warn: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
        vi.resetModules()
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
        // 让这个包 import 即抛,等价于没装
        vi.doMock(pkg, () => { throw new Error(`Cannot find package '${pkg}'`) })
    })
    afterEach(() => { vi.doUnmock(pkg); vi.restoreAllMocks(); vi.resetModules() })

    it('告警一次、不抛、编辑器与 model 照常可用、没有 provider 也没有 marker', async () => {
        const { editor, Uri } = await import('../../src/index')
        const { languageFeatures } = await import('../../src/lang/languagefeatures')
        const a = editor.createModel(text, lang, Uri.parse(`file:///miss-a.${lang}`))
        const b = editor.createModel(text, lang, Uri.parse(`file:///miss-b.${lang}`)) // 第二个同语言 model 不会再告警
        await wait(300)
        const mine = warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes(pkg))
        expect(mine).toHaveLength(1)
        expect(String(mine[0][0])).toContain('[lite-monaco]')
        expect(languageFeatures.completionProvider.ordered(a as never)).toEqual([])
        expect(editor.getModelMarkers({ resource: a.uri })).toEqual([])
        // 编辑器本身照常:能编辑、能取值
        a.setValue(text + '\n')
        expect(a.getValue()).toBe(text + '\n')
        expect(b.getLineCount()).toBeGreaterThanOrEqual(1)
        a.dispose(); b.dispose()
    })
})
