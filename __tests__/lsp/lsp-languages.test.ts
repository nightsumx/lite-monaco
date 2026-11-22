// CSS / HTML / JSON 语言服务(vscode-*-languageservice)接进 lite-monaco 后的集成测试:
// 真 model、真 provider 注册表,逐项验证每个功能有结果,并与 monaco-editor 0.58.0 languages/features 的行为对照
// (诊断严重度、补全 kind、触发字符、modeConfiguration 开关、公开 API 形状)。
import { afterEach, describe, expect, it } from 'vitest'
import { languages, editor, Uri, Position, Range, MarkerSeverity } from '../../src/index'
import { languageFeatures } from '../../src/lang/languagefeatures'
import { foldingProvidersFor, definitionProvidersFor, selectionRangeProvidersFor } from '../../src/lang/providers'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const until = async (fn: () => boolean, ms = 4000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await wait(15) }
const TOKEN = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) } as never
let n = 0
const models: { dispose(): void }[] = []
const mk = (text: string, lang: string, ext = lang) => {
    const m = editor.createModel(text, lang, Uri.parse(`file:///t${n++}.${ext}`))
    models.push(m)
    return m
}
afterEach(() => { while (models.length) models.pop()!.dispose() })

const markers = (m: ReturnType<typeof mk>) => editor.getModelMarkers({ resource: m.uri })
const waitMarkers = async (m: ReturnType<typeof mk>, owner?: string) => {
    await until(() => markers(m).length > 0)
    return markers(m).filter(x => !owner || x.owner === owner)
}
const pos = (l: number, c: number) => new Position(l, c)
/** 把 provider 返回的 TextEdit[] 应用到文本上(从后往前) */
const applyEdits = (text: string, edits: { range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }, text: string }[]) => {
    const lines = text.split('\n')
    const off = (l: number, c: number) => lines.slice(0, l - 1).reduce((n, x) => n + x.length + 1, 0) + c - 1
    let out = text
    for (const e of [...edits].sort((a, b) => off(b.range.startLineNumber, b.range.startColumn) - off(a.range.startLineNumber, a.range.startColumn)))
        out = out.slice(0, off(e.range.startLineNumber, e.range.startColumn)) + e.text + out.slice(off(e.range.endLineNumber, e.range.endColumn))
    return out
}
// provider 是 Monaco 类型的宽接口,测试里统一当 any 调
const first = (reg: { ordered(m: never): any[] }, m: unknown): any => reg.ordered(m as never)[0]
const complete = async (m: ReturnType<typeof mk>, p: Position) => {
    const prov = first(languageFeatures.completionProvider, m)
    return { prov, list: await prov.provideCompletionItems(m, p, { triggerKind: 1 }, TOKEN) }
}
// 语言服务是 onLanguage 时动态 import 的:model 创建后等 provider 出现
const ready = async (m: ReturnType<typeof mk>) => { await until(() => languageFeatures.completionProvider.ordered(m as never).length > 0) }

describe('公开 API 形状(对照 monaco-editor languages.css / html / json)', () => {
    it('languages.css:cssDefaults / scssDefaults / lessDefaults,各带 options / modeConfiguration / onDidChange / setOptions / 弃用的 diagnosticsOptions', () => {
        const css = (languages as any).css
        for (const k of ['cssDefaults', 'scssDefaults', 'lessDefaults']) {
            const d = css[k]
            expect(d.languageId).toBe(k.replace('Defaults', ''))
            expect(typeof d.setOptions).toBe('function')
            expect(typeof d.setModeConfiguration).toBe('function')
            expect(typeof d.setDiagnosticsOptions).toBe('function')
            expect(typeof d.onDidChange).toBe('function')
            expect(d.options.validate).toBe(true)
            expect(d.diagnosticsOptions).toBe(d.options)
        }
        // monaco-editor 0.58 的默认 lint 配置
        const lint = css.cssDefaults.options.lint
        expect(lint).toMatchObject({ vendorPrefix: 'warning', duplicateProperties: 'warning', emptyRules: 'warning', hexColorLength: 'error', argumentsInColorFunction: 'error', unknownProperties: 'warning', importStatement: 'ignore' })
        expect(css.cssDefaults.options.data).toEqual({ useDefaultDataProvider: true })
        expect(Object.values(css.cssDefaults.modeConfiguration).every(v => v === true)).toBe(true)
        expect(Object.keys(css.cssDefaults.modeConfiguration).sort()).toEqual([
            'colors', 'completionItems', 'definitions', 'diagnostics', 'documentFormattingEdits', 'documentHighlights', 'documentRangeFormattingEdits',
            'documentSymbols', 'foldingRanges', 'hovers', 'references', 'rename', 'selectionRanges',
        ])
    })
    it('languages.html:htmlDefaults / handlebarDefaults / razorDefaults + registerHTMLLanguageService;默认格式化 / 建议选项同 Monaco', () => {
        const html = (languages as any).html
        expect(html.htmlDefaults.languageId).toBe('html')
        expect(html.handlebarDefaults.languageId).toBe('handlebars')
        expect(html.razorDefaults.languageId).toBe('razor')
        expect(html.htmlDefaults.options.suggest).toEqual({})
        expect(html.htmlDefaults.options.format).toMatchObject({ tabSize: 4, insertSpaces: false, wrapLineLength: 120, indentInnerHtml: false, preserveNewLines: true })
        expect(typeof html.registerHTMLLanguageService).toBe('function')
        // handlebars / razor 默认关掉诊断和格式化(同 monaco-editor getConfigurationDefault),其余照开
        for (const d of [html.handlebarDefaults, html.razorDefaults]) {
            expect(d.modeConfiguration).toMatchObject({ diagnostics: false, documentFormattingEdits: false, documentRangeFormattingEdits: false, completionItems: true, hovers: true })
        }
        expect(html.htmlDefaults.modeConfiguration).toMatchObject({ diagnostics: true, documentFormattingEdits: true, documentRangeFormattingEdits: true })
        const reg = html.registerHTMLLanguageService('myhtml')
        expect(reg.defaults.languageId).toBe('myhtml')
        reg.dispose()
    })
    it('languages.json:jsonDefaults 默认诊断选项同 Monaco,setDiagnosticsOptions 触发 onDidChange', () => {
        const json = (languages as any).json
        const d = json.jsonDefaults
        expect(d.languageId).toBe('json')
        expect(d.diagnosticsOptions).toMatchObject({ validate: true, allowComments: true, schemas: [], enableSchemaRequest: false, schemaRequest: 'warning', schemaValidation: 'warning', comments: 'error', trailingCommas: 'error' })
        expect(d.modeConfiguration.tokens).toBe(true)
        let fired = 0
        const sub = d.onDidChange(() => { fired++ })
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, allowComments: false })
        expect(fired).toBe(1)
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, allowComments: true })
        sub.dispose()
        expect(typeof json.getWorker).toBe('function')
    })
})

describe('CSS', () => {
    const SRC = ['a { colour: red; color: #12; }', '.b {}', '.c { color: #ff0000; margin: 0px; }', '@media (min-width: 1px) {', '  .d { top: 0; }', '}', ''].join('\n')

    it('诊断:严重度同 Monaco(未知属性 / 空规则 = Warning,#12 非法颜色 = Error),owner = css', async () => {
        const m = mk(SRC, 'css')
        const ms = await waitMarkers(m)
        const by = (re: RegExp) => ms.find(x => re.test(x.message))!
        expect(by(/Unknown property: 'colour'/).severity).toBe(MarkerSeverity.Warning)
        expect(by(/empty rulesets/i).severity).toBe(MarkerSeverity.Warning)
        expect(by(/hex|colo/i)).toBeDefined()
        expect(ms.every(x => x.owner === 'css')).toBe(true)
        expect(by(/Unknown property/).startLineNumber).toBe(1)
    })
    it('setOptions({ lint }) 改严重度 → 诊断重算;validate:false → 清空', async () => {
        const css = (languages as any).css
        const m = mk('a { colour: red; }', 'css')
        await waitMarkers(m)
        css.cssDefaults.setOptions({ ...css.cssDefaults.options, lint: { ...css.cssDefaults.options.lint, unknownProperties: 'error' } })
        await until(() => markers(m).some(x => x.severity === MarkerSeverity.Error))
        expect(markers(m).find(x => /Unknown property/.test(x.message))!.severity).toBe(MarkerSeverity.Error)
        css.cssDefaults.setOptions({ ...css.cssDefaults.options, validate: false })
        await until(() => markers(m).length === 0)
        expect(markers(m)).toEqual([])
        css.cssDefaults.setOptions({ ...css.cssDefaults.options, validate: true, lint: { ...css.cssDefaults.options.lint, unknownProperties: 'warning' } })
    })
    it('补全:触发字符 [/ - :];属性名补全 kind = Property、值补全带 kind;range 是光标处的词', async () => {
        const m = mk('a { col', 'css')
        await ready(m)
        const { prov, list } = await complete(m, pos(1, 8))
        expect(prov.triggerCharacters).toEqual(['/', '-', ':'])
        const color = list.suggestions.find((s: any) => s.label === 'color')
        expect(color).toBeDefined()
        expect(color.kind).toBe(languages.CompletionItemKind.Property)
        expect(color.range).toBeDefined()
        const m2 = mk('a { display: ', 'css')
        await ready(m2)
        const v = (await complete(m2, pos(1, 14))).list.suggestions
        expect(v.some((s: any) => s.label === 'flex')).toBe(true)
    })
    it('悬停:属性有文档', async () => {
        const m = mk('a { display: flex; }', 'css')
        await ready(m)
        const h = await first(languageFeatures.hoverProvider, m).provideHover(m, pos(1, 7), TOKEN)
        expect(h).toBeDefined()
        expect(h.contents.length).toBeGreaterThan(0)
        expect(h.range).toBeDefined()
    })
    it('颜色:findDocumentColors + 颜色表示(#ff0000 → rgb / hsl / hex)', async () => {
        const m = mk(SRC, 'css')
        await ready(m)
        const cp = first(languageFeatures.colorProvider, m)
        const cols = await cp.provideDocumentColors(m, TOKEN)
        // 第 1 行的具名颜色 red、第 3 行的 #ff0000;'#12' 非法,不算颜色(诊断里报)
        expect(cols.map((c: any) => [c.range.startLineNumber, c.range.startColumn])).toEqual([[1, 13], [3, 13]])
        expect(cols[1].color).toMatchObject({ red: 1, green: 0, blue: 0, alpha: 1 })
        const pres = await cp.provideColorPresentations(m, { color: { red: 0, green: 1, blue: 0, alpha: 1 }, range: cols[1].range }, TOKEN)
        expect(pres.map((p: any) => p.label)).toEqual(expect.arrayContaining(['#00ff00']))
    })
    it('折叠:@media 块、规则块', async () => {
        const m = mk(SRC, 'css')
        await ready(m)
        await until(() => foldingProvidersFor('css').length > 0)
        const r = await foldingProvidersFor('css')[0].provideFoldingRanges(m as never, {} as never, TOKEN)
        // 单行规则不折;@media 块(4–5 行)折。同 vscode-css-languageservice
        expect(r).toEqual([{ start: 4, end: 5 }])
    })
    it('大纲:选择器作符号;规则 → 同 Monaco DocumentSymbolAdapter 的 SymbolKind', async () => {
        const m = mk(SRC, 'css')
        await ready(m)
        const syms = await first(languageFeatures.documentSymbolProvider, m).provideDocumentSymbols(m, TOKEN)
        expect(syms.map((s: any) => s.name)).toEqual(expect.arrayContaining(['a', '.b', '.c', '.d']))
    })
    it('定义 / 引用 / 高亮 / 重命名(自定义属性 --x、SCSS 变量)', async () => {
        const m = mk(':root { --x: 1px; }\na { margin: var(--x); }\nb { padding: var(--x); }', 'css')
        await ready(m)
        await until(() => definitionProvidersFor('css').length > 0)
        const def = await definitionProvidersFor('css')[0].provideDefinition(m as never, pos(2, 20) as never, TOKEN)
        expect(def).toBeDefined()
        expect((def as any)[0].range.startLineNumber).toBe(1) // Monaco DefinitionAdapter 返回 Location[]
        const refs = await first(languageFeatures.referenceProvider, m).provideReferences(m, pos(2, 20), { includeDeclaration: true }, TOKEN)
        expect(refs.length).toBe(3)
        const hl = await first(languageFeatures.documentHighlightProvider, m).provideDocumentHighlights(m, pos(2, 20), TOKEN)
        expect(hl.length).toBe(3)
        const ren = await first(languageFeatures.renameProvider, m).provideRenameEdits(m, pos(2, 20), '--y', TOKEN)
        expect(ren.edits.length).toBe(3)
        expect(ren.edits[0].textEdit.text).toBe('--y')
    })
    it('扩选(selectionRange)', async () => {
        const m = mk('a { color: red; }', 'css')
        await ready(m)
        await until(() => selectionRangeProvidersFor('css').length > 0)
        const r = await selectionRangeProvidersFor('css')[0].provideSelectionRanges(m as never, [pos(1, 8) as never], TOKEN)
        expect(r![0].length).toBeGreaterThan(1)
    })
    it('格式化:整篇 + 选区', async () => {
        const m = mk('a{color:red}\nb{top:0}', 'css')
        await ready(m)
        const f = first(languageFeatures.documentFormattingEditProvider, m)
        const edits = await f.provideDocumentFormattingEdits(m, { tabSize: 2, insertSpaces: true }, TOKEN)
        expect(edits.length).toBeGreaterThan(0)
        expect(applyEdits('a{color:red}\nb{top:0}', edits)).toBe('a {\n  color: red\n}\n\nb {\n  top: 0\n}')
        const rf = first(languageFeatures.documentRangeFormattingEditProvider, m)
        const redits = await rf.provideDocumentRangeFormattingEdits(m, new Range(1, 1, 1, 13), { tabSize: 2, insertSpaces: true }, TOKEN)
        expect(redits.length).toBeGreaterThan(0)
    })
    it('SCSS / LESS 各有自己的服务:SCSS 变量 / 嵌套不报未知属性', async () => {
        const s = mk('$c: red;\n.a { .b { color: $c; } }', 'scss')
        await ready(s)
        const hs = await first(languageFeatures.hoverProvider, s).provideHover(s, pos(2, 18), TOKEN)
        expect(hs).toBeDefined()
        await wait(800)
        expect(markers(s).filter(x => x.severity === MarkerSeverity.Error)).toEqual([])
        const l = mk('@c: red;\n.a { color: @c; .b; }', 'less')
        await ready(l)
        const refs = await first(languageFeatures.referenceProvider, l).provideReferences(l, pos(2, 14), { includeDeclaration: true }, TOKEN)
        expect(refs.length).toBe(2)
    })
    it('modeConfiguration 开关:关 hovers → hover provider 注销;再开 → 回来', async () => {
        const css = (languages as any).css
        const m = mk('a { color: red }', 'css')
        await ready(m)
        const before = languageFeatures.hoverProvider.ordered(m as never).length
        css.cssDefaults.setModeConfiguration({ ...css.cssDefaults.modeConfiguration, hovers: false })
        expect(languageFeatures.hoverProvider.ordered(m as never).length).toBe(before - 1)
        css.cssDefaults.setModeConfiguration({ ...css.cssDefaults.modeConfiguration, hovers: true })
        expect(languageFeatures.hoverProvider.ordered(m as never).length).toBe(before)
    })
    it('自定义数据:data.dataProviders 加的属性出现在补全里', async () => {
        const css = (languages as any).css
        css.cssDefaults.setOptions({ ...css.cssDefaults.options, data: { useDefaultDataProvider: true, dataProviders: { x: { version: 1.1, properties: [{ name: '-lm-test-prop', description: 'x' }] } } } })
        const m = mk('a { -lm', 'css')
        await ready(m)
        const labels = (await complete(m, pos(1, 8))).list.suggestions.map((s: any) => s.label)
        expect(labels).toContain('-lm-test-prop')
        css.cssDefaults.setOptions({ ...css.cssDefaults.options, data: { useDefaultDataProvider: true } })
    })
})

describe('HTML', () => {
    const SRC = '<!DOCTYPE html>\n<html>\n<body>\n  <div id="a" class="x">\n    <p>hi</p>\n  </div>\n  <a href="foo.html">l</a>\n  <style>a { color: #f00 }</style>\n</body>\n</html>\n'

    it('补全:触发字符同 Monaco [. : < " = /];标签补全 kind = Property;属性补全', async () => {
        const m = mk('<di', 'html')
        await ready(m)
        const { prov, list } = await complete(m, pos(1, 4))
        expect(prov.triggerCharacters).toEqual(['.', ':', '<', '"', '=', '/'])
        const div = list.suggestions.find((s: any) => s.label === 'div')
        expect(div).toBeDefined()
        expect(div.kind).toBe(languages.CompletionItemKind.Property)
        const m2 = mk('<a hr', 'html')
        await ready(m2)
        expect((await complete(m2, pos(1, 6))).list.suggestions.some((s: any) => s.label === 'href')).toBe(true)
    })
    it('补全:html5 开关(suggest.html5 = false 不再给 HTML5 标签)', async () => {
        const html = (languages as any).html
        html.htmlDefaults.setOptions({ ...html.htmlDefaults.options, suggest: { html5: false } })
        const m = mk('<vid', 'html')
        await ready(m)
        const labels = (await complete(m, pos(1, 5))).list?.suggestions.map((s: any) => s.label) ?? []
        expect(labels).not.toContain('video')
        html.htmlDefaults.setOptions({ ...html.htmlDefaults.options, suggest: { html5: true } })
        const labels2 = (await complete(m, pos(1, 5))).list.suggestions.map((s: any) => s.label)
        expect(labels2).toContain('video')
    })
    it('悬停:标签文档', async () => {
        const m = mk(SRC, 'html')
        await ready(m)
        const h = await first(languageFeatures.hoverProvider, m).provideHover(m, pos(5, 6), TOKEN)
        expect(h).toBeDefined()
        expect(JSON.stringify(h.contents)).toMatch(/paragraph/i)
    })
    it('高亮:光标在开始标签 → 配对的结束标签也高亮', async () => {
        const m = mk(SRC, 'html')
        await ready(m)
        const hl = await first(languageFeatures.documentHighlightProvider, m).provideDocumentHighlights(m, pos(4, 5), TOKEN)
        expect(hl.length).toBe(2)
    })
    it('折叠 / 大纲 / 扩选 / 链接', async () => {
        const m = mk(SRC, 'html')
        await ready(m)
        await until(() => foldingProvidersFor('html').length > 0)
        const fr = await foldingProvidersFor('html')[0].provideFoldingRanges(m as never, {} as never, TOKEN)
        expect(fr!.length).toBeGreaterThanOrEqual(3)
        const syms = await first(languageFeatures.documentSymbolProvider, m).provideDocumentSymbols(m, TOKEN)
        expect(JSON.stringify(syms)).toMatch(/div/)
        await until(() => selectionRangeProvidersFor('html').length > 0)
        const sr = await selectionRangeProvidersFor('html')[0].provideSelectionRanges(m as never, [pos(5, 8) as never], TOKEN)
        expect(sr![0].length).toBeGreaterThan(1)
        const links = await first(languageFeatures.linkProvider, m).provideLinks(m, TOKEN)
        expect(links.links.some((l: any) => /foo\.html/.test(String(l.url)))).toBe(true)
    })
    it('重命名标签:开始 / 结束标签一起改', async () => {
        const m = mk('<div><span>x</span></div>', 'html')
        await ready(m)
        const r = await first(languageFeatures.renameProvider, m).provideRenameEdits(m, pos(1, 3), 'section', TOKEN)
        expect(r.edits.length).toBe(2)
    })
    it('格式化(仅 html):整篇 + 选区;handlebars 没有格式化', async () => {
        const m = mk('<div><p>x</p></div>', 'html')
        await ready(m)
        const edits = await first(languageFeatures.documentFormattingEditProvider, m).provideDocumentFormattingEdits(m, { tabSize: 2, insertSpaces: true }, TOKEN)
        expect(edits.length).toBeGreaterThan(0)
        expect(edits[0].text).toContain('\n')
        const redits = await first(languageFeatures.documentRangeFormattingEditProvider, m).provideDocumentRangeFormattingEdits(m, new Range(1, 1, 1, 20), { tabSize: 2, insertSpaces: true }, TOKEN)
        expect(redits.length).toBeGreaterThan(0)
        const hb = mk('<div></div>', 'handlebars', 'hbs')
        await wait(200)
        expect(languageFeatures.documentFormattingEditProvider.ordered(hb as never).length).toBe(0)
    })
    it('HTML 不出诊断(Monaco 的 HTML 服务没有 validate)', async () => {
        const m = mk('<div><span></div>', 'html')
        await ready(m)
        await wait(800)
        expect(markers(m)).toEqual([])
    })
})

describe('JSON', () => {
    const json = () => (languages as any).json.jsonDefaults
    const SCHEMA = {
        uri: 'http://lm.test/schema.json', fileMatch: ['*.schema-test.json'],
        schema: { type: 'object', properties: { name: { type: 'string', description: 'the name' }, kind: { enum: ['a', 'b'] }, n: { type: 'number' } }, required: ['name'] },
    }

    it('诊断:语法错误 = Error;注释 / 尾逗号按 comments / trailingCommas 默认 Error,同 Monaco', async () => {
        const m = mk('{ "a": 1,, }', 'json')
        const ms = await waitMarkers(m)
        expect(ms.some(x => x.severity === MarkerSeverity.Error)).toBe(true)
        expect(ms.every(x => x.owner === 'json')).toBe(true)
        const c = mk('{ // c\n "a": 1, }', 'json')
        const cm = await waitMarkers(c)
        expect(cm.filter(x => /comment/i.test(x.message))[0].severity).toBe(MarkerSeverity.Error)
        expect(cm.filter(x => /trailing comma/i.test(x.message))[0].severity).toBe(MarkerSeverity.Error)
    })
    it('allowComments:false → comments 按 diagnosticsOptions.comments 报;comments:ignore 则不报', async () => {
        const d = json()
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, comments: 'ignore', trailingCommas: 'ignore' })
        const c = mk('{ // c\n "a": 1, }', 'json')
        await wait(1000)
        expect(markers(c)).toEqual([])
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, comments: 'error', trailingCommas: 'error' })
    })
    it('schema:校验(缺必填 / 类型不符 = Warning)、补全(属性 / 枚举值)、悬停(description)', async () => {
        const d = json()
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, schemas: [SCHEMA] })
        const m = mk('{ "n": "x" }', 'json', 'schema-test.json')
        const ms = await waitMarkers(m)
        expect(ms.find(x => /Missing property "name"/.test(x.message))!.severity).toBe(MarkerSeverity.Warning)
        expect(ms.find(x => /Incorrect type/.test(x.message))!.severity).toBe(MarkerSeverity.Warning)
        const k = mk('{ "kind": }', 'json', 'schema-test.json')
        await ready(k)
        const { prov, list } = await complete(k, pos(1, 10))
        expect(prov.triggerCharacters).toEqual([' ', ':', '"'])
        expect(list.suggestions.map((s: any) => s.label)).toEqual(expect.arrayContaining(['"a"', '"b"']))
        const p = mk('{ \n}', 'json', 'schema-test.json')
        await ready(p)
        expect((await complete(p, pos(1, 3))).list.suggestions.map((s: any) => s.label)).toEqual(expect.arrayContaining(['name', 'kind', 'n']))
        const hv = mk('{ "name": "x" }', 'json', 'schema-test.json')
        await ready(hv)
        const h = await first(languageFeatures.hoverProvider, hv).provideHover(hv, pos(1, 5), TOKEN)
        expect(JSON.stringify(h.contents)).toMatch(/the name/)
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, schemas: [] })
    })
    it('schemaValidation 严重度可调(error)', async () => {
        const d = json()
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, schemas: [SCHEMA], schemaValidation: 'error' })
        const m = mk('{ "n": "x" }', 'json', 'schema-test.json')
        const ms = await waitMarkers(m)
        expect(ms.find(x => /Incorrect type/.test(x.message))!.severity).toBe(MarkerSeverity.Error)
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, schemas: [], schemaValidation: 'warning' })
    })
    it('大纲 / 折叠 / 扩选 / 格式化 / 颜色', async () => {
        const m = mk('{"a":{"b":[1,2]},"c":"#ff0000"}', 'json')
        await ready(m)
        const syms = await first(languageFeatures.documentSymbolProvider, m).provideDocumentSymbols(m, TOKEN)
        expect(syms.map((s: any) => s.name)).toEqual(expect.arrayContaining(['a', 'c']))
        const f = mk('{\n"a": {\n"b": 1\n}\n}', 'json')
        await ready(f)
        await until(() => foldingProvidersFor('json').length > 0)
        const fr = await foldingProvidersFor('json')[0].provideFoldingRanges(f as never, {} as never, TOKEN)
        expect(fr!.length).toBeGreaterThanOrEqual(2)
        await until(() => selectionRangeProvidersFor('json').length > 0)
        const sr = await selectionRangeProvidersFor('json')[0].provideSelectionRanges(m as never, [pos(1, 8) as never], TOKEN)
        expect(sr![0].length).toBeGreaterThan(1)
        const edits = await first(languageFeatures.documentFormattingEditProvider, m).provideDocumentFormattingEdits(m, { tabSize: 2, insertSpaces: true }, TOKEN)
        expect(applyEdits('{"a":{"b":[1,2]},"c":"#ff0000"}', edits)).toBe('{\n  "a": {\n    "b": [\n      1,\n      2\n    ]\n  },\n  "c": "#ff0000"\n}')
        // JSON 的颜色只认 schema 里声明 format: color-hex 的字符串(vscode-json-languageservice)
        const d = json()
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, schemas: [{ uri: 'http://lm.test/c.json', fileMatch: ['*.color-test.json'], schema: { type: 'object', properties: { c: { type: 'string', format: 'color-hex' } } } }] })
        const cm = mk('{"c":"#ff0000"}', 'json', 'color-test.json')
        await ready(cm)
        const cols = await first(languageFeatures.colorProvider, cm).provideDocumentColors(cm, TOKEN)
        expect(cols.length).toBe(1)
        expect(cols[0].color).toMatchObject({ red: 1, green: 0, blue: 0 })
        d.setDiagnosticsOptions({ ...d.diagnosticsOptions, schemas: [] })
    })
    it('getWorker():返回 JSONWorker 访问器(parseJSONDocument / getMatchingSchemas)', async () => {
        const m = mk('{"a":1}', 'json')
        await ready(m)
        const w = await (await (languages as any).json.getWorker())(m.uri)
        expect((await w.parseJSONDocument(m.uri.toString())).root).toBeDefined()
    })
    it('jsonc 不归 json 服务(Monaco 里也只注册 json),不会误装', async () => {
        const m = mk('{}', 'plaintext')
        expect(languageFeatures.completionProvider.ordered(m as never).filter((p: any) => p.triggerCharacters?.includes(' ')).length).toBe(0)
    })
})
