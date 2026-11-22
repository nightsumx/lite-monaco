// HTML / CSS / JSON 的悬停与补全文档(vscode-*-languageservice 自带的 HTML5 / MDN 数据),
// 以及 smoke(monaco-editor test/smoke)里「F1 → Show Hover」走的 Show Definition Preview Hover 在没有定义时也要弹出普通 hover。
import { afterEach, describe, expect, it } from 'vitest'
import { editor, Uri, Position } from '../../src/index'
import { languageFeatures } from '../../src/lang/languagefeatures'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const TOKEN = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) } as never
let n = 0
const models: { dispose(): void }[] = []
const mk = (text: string, lang: string) => { const m = editor.createModel(text, lang, Uri.parse(`file:///docs${n++}.${lang}`)); models.push(m); return m }
afterEach(() => { while (models.length) models.pop()!.dispose() })
const untilProvider = async (reg: { ordered(m: never): unknown[] }, m: unknown) => { for (let i = 0; i < 300 && reg.ordered(m as never).length === 0; i++) await wait(15) }
const hoverText = async (m: ReturnType<typeof mk>, l: number, c: number) => {
    await untilProvider(languageFeatures.hoverProvider as never, m)
    const prov = (languageFeatures.hoverProvider.ordered(m as never) as any[])[0]
    const h = await prov?.provideHover(m, new Position(l, c), TOKEN)
    return ((h?.contents ?? []) as { value: string }[]).map(x => x.value).join('\n')
}
const completions = async (m: ReturnType<typeof mk>, l: number, c: number) => {
    await untilProvider(languageFeatures.completionProvider as never, m)
    const prov = (languageFeatures.completionProvider.ordered(m as never) as any[])[0]
    return (await prov.provideCompletionItems(m, new Position(l, c), { triggerKind: 1 }, TOKEN)).suggestions as { label: string | { label: string }, documentation?: unknown }[]
}
const label = (x: { label: string | { label: string } }) => typeof x.label === 'string' ? x.label : x.label.label
const docText = (d: unknown) => typeof d === 'string' ? d : (d as { value?: string } | undefined)?.value ?? ''

describe('HTML 悬停 / 补全带 HTML5 数据文档', () => {
    it('标签悬停:<title> 给出 "The title element represents the document\'s title or name"(monaco-editor smoke 的断言)', async () => {
        expect(await hoverText(mk('<title>hi</title>', 'html'), 1, 3)).toContain("The title element represents the document's title or name")
    })
    it('属性悬停:<a href> 给出属性文档', async () => {
        expect(await hoverText(mk('<a href="x" target="_blank">', 'html'), 1, 5)).toContain('URL')
    })
    it('标签补全:div 带文档', async () => {
        const items = await completions(mk('<di', 'html'), 1, 4)
        const div = items.find(x => label(x) === 'div')
        expect(div).toBeTruthy()
        expect(docText(div!.documentation).length).toBeGreaterThan(10)
    })
    it('属性补全:<a hr| 里有 href,带文档', async () => {
        const items = await completions(mk('<a hr', 'html'), 1, 6)
        const href = items.find(x => label(x) === 'href')
        expect(href).toBeTruthy()
        expect(docText(href!.documentation).length).toBeGreaterThan(5)
    })
})

describe('CSS 悬停 / 补全带 MDN 数据文档', () => {
    it('属性悬停:display 给出说明和浏览器支持', async () => {
        const t = await hoverText(mk('a { display: flex; }', 'css'), 1, 6)
        expect(t).toContain('box')
        expect(t).toMatch(/Edge|Firefox|Safari/)
    })
    it('属性补全:disp → display 带文档', async () => {
        const items = await completions(mk('a { disp', 'css'), 1, 9)
        const d = items.find(x => label(x) === 'display')
        expect(d).toBeTruthy()
        expect(docText(d!.documentation).length).toBeGreaterThan(10)
    })
})

describe('JSON 悬停 / 补全带 schema 文档', () => {
    it('有 schema 时:属性悬停给出 description', async () => {
        const { languages } = await import('../../src/index')
        ;(languages as any).json.jsonDefaults.setDiagnosticsOptions({ validate: true, schemas: [{ uri: 'file:///s-docs.json', fileMatch: ['*docs-schema*'], schema: { type: 'object', properties: { name: { type: 'string', description: 'The package name.' } } } }] })
        const m = editor.createModel('{"name": "x"}', 'json', Uri.parse('file:///docs-schema.json'))
        models.push(m)
        await wait(200)
        expect(await hoverText(m, 1, 4)).toMatch(/The package name\\?\./)
    })
    it('补全:{} 里有 schema 属性,带 description', async () => {
        const { languages } = await import('../../src/index')
        ;(languages as any).json.jsonDefaults.setDiagnosticsOptions({ validate: true, schemas: [{ uri: 'file:///s-docs2.json', fileMatch: ['*docs2-schema*'], schema: { type: 'object', properties: { alpha: { type: 'string', description: 'Alpha doc.' } } } }] })
        const m = editor.createModel('{}', 'json', Uri.parse('file:///docs2-schema.json'))
        models.push(m)
        await wait(200)
        const a = (await completions(m, 1, 2)).find(x => label(x) === 'alpha')
        expect(a).toBeTruthy()
        expect(docText(a!.documentation)).toContain('Alpha doc.')
    })
})

describe('Show Definition Preview Hover:没有定义时照常弹 hover(Monaco hoverActions.ts)', () => {
    it('真编辑器 html:F1 → Show Hover 第一项(Show Definition Preview Hover)在 <title> 上弹出带文档的 hover 卡', async () => {
        const { createEditor } = await import('../../src/index')
        const host = document.createElement('div'); document.body.appendChild(host)
        const ed: any = createEditor(host, { value: '<title>hi</title>', language: 'html' } as never)
        await untilProvider(languageFeatures.hoverProvider as never, ed.getModel())
        ed.setPosition({ lineNumber: 1, column: 3 })
        await ed.getAction('editor.action.showDefinitionPreviewHover').run()
        for (let i = 0; i < 400 && !document.querySelector('.cm-provider-hover'); i++) await wait(25)
        expect(document.querySelector('.cm-provider-hover')?.textContent).toContain("The title element represents the document's title or name")
        ed.dispose(); host.remove()
    })
})
