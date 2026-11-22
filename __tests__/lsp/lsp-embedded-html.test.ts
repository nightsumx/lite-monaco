// HTML 内嵌 <style> / <script> 的补全:对照 monaco-editor 0.58.0 的 languages/features/html。
// 结论(固化在这里):Monaco 的 htmlWorker.doComplete 直接调 vscode-html-languageservice.doComplete,
// 该库不做嵌入语言委托(VS Code 里是 html 服务器另外把嵌入文档交给 css/js 服务),所以 Monaco 里 <style> / <script>
// 内部的补全就是 0 项。lite-monaco 与 Monaco 同一份 worker 代码,行为一致;这不是缺陷,而是对齐。
import { afterEach, describe, expect, it } from 'vitest'
import { editor, Uri, Position } from '../../src/index'
import { languageFeatures } from '../../src/lang/languagefeatures'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const TOKEN = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) } as never
let n = 0
const models: { dispose(): void }[] = []
afterEach(() => { while (models.length) models.pop()!.dispose() })

async function htmlComplete(text: string, line: number, col: number) {
    const m = editor.createModel(text, 'html', Uri.parse(`file:///emb${n++}.html`))
    models.push(m)
    for (let i = 0; i < 300 && !languageFeatures.completionProvider.ordered(m as never).length; i++) await wait(15)
    const prov: any = languageFeatures.completionProvider.ordered(m as never)[0]
    const list = await prov.provideCompletionItems(m, new Position(line, col), { triggerKind: 1 }, TOKEN)
    return (list?.suggestions ?? []).map((s: any) => String(s.label))
}

describe('HTML 内嵌语言(同 Monaco:HTML 服务不委托)', () => {
    it('<style> 内部的属性名补全 = 0 项(Monaco 同)', async () => {
        expect(await htmlComplete('<style>\n  body { col }\n</style>', 2, 12)).toEqual([])
    })
    it('<script> 内部(JS)补全 = 0 项(Monaco 同)', async () => {
        expect(await htmlComplete('<script>\n  var a = 1;\n</script>', 2, 8)).toEqual([])
    })
    it('<script type="application/json"> 内部补全 = 0 项(Monaco 同)', async () => {
        expect(await htmlComplete('<script type="application/json">{"a": }</script>', 1, 38)).toEqual([])
    })
    it('空 <style></style> 内也没有 HTML 标签补全(内容是原始文本)', async () => {
        expect(await htmlComplete('<style>\n\n</style>', 2, 1)).toEqual([])
    })
    it('对照:元素外的 HTML 补全照常有,说明上面的 0 是内嵌语言造成的,不是服务没起来', async () => {
        const labels = await htmlComplete('<div></div>\n<', 2, 2)
        expect(labels).toEqual(expect.arrayContaining(['div', 'span', 'style', 'script']))
    })
    it('style 属性里的值位置有 HTML 服务自己的补全(属性值),不是内嵌 CSS 的补全', async () => {
        const labels = await htmlComplete('<div style=""></div>', 1, 13)
        expect(Array.isArray(labels)).toBe(true) // Monaco 同:只有 HTML 层面的结果,不含 CSS 属性名列表
        expect(labels).not.toContain('background-color')
    })
    it('HTML 不出诊断:内嵌 <style> 里的 CSS 错误不会产生 marker(Monaco 的 HTML 服务没有 validate)', async () => {
        const m = editor.createModel('<style>\n a { colr: red; #12 }\n</style>', 'html', Uri.parse(`file:///emb${n++}.html`))
        models.push(m)
        await wait(400)
        expect(editor.getModelMarkers({ resource: m.uri })).toEqual([])
    })
})
