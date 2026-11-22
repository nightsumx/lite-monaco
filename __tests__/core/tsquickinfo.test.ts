import { describe, expect, it } from 'vitest'
import { bumpVersion, renderQuickInfo, tsQuickInfoSource } from '../../src/lang/tsquickinfo'
import { tsDiagnosticToLit } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import { EditorState } from '../../src/core/model/state'
import type { QuickInfo, SymbolDisplayPart } from 'typescript'

// 不 import typescript 运行时:造最小 QuickInfo 对象。part 带 kind → 渲成 <span class="cm-qi-{kind}">。
const part = (text: string, kind = 'text'): SymbolDisplayPart => ({ text, kind })

describe('renderQuickInfo —— QuickInfo → DOM', () => {
    it('签名逐 part 按 kind 上色 span(对齐 Monaco,非纯文本)', () => {
        const qi = {
            displayParts: [part('type', 'keyword'), part(' ', 'space'), part('Cleanup', 'aliasName'), part(' = () => ', 'punctuation'), part('void', 'keyword')],
        } as unknown as QuickInfo
        const dom = renderQuickInfo(qi)
        const sig = dom.querySelector('.cm-quickinfo-sig')!
        expect(sig.textContent).toBe('type Cleanup = () => void')
        expect(sig.querySelector('.cm-qi-keyword')!.textContent).toBe('type')
        expect(sig.querySelector('.cm-qi-aliasName')!.textContent).toBe('Cleanup')
        expect(sig.querySelectorAll('span').length).toBe(5) // 每个 part 一个 span
    })

    it('有 documentation → 签名 + JSDoc 两块', () => {
        const qi = {
            displayParts: [part('const foo: ', 'keyword'), part('() => void')],
            documentation: [part('初始化副作用')],
        } as unknown as QuickInfo
        const dom = renderQuickInfo(qi)
        expect(dom.className).toBe('cm-quickinfo')
        expect(dom.querySelector('.cm-quickinfo-sig')!.textContent).toBe('const foo: () => void')
        expect(dom.querySelector('.cm-quickinfo-doc')!.textContent).toBe('初始化副作用')
    })

    it('无 documentation → 不出 JSDoc 块', () => {
        const qi = { displayParts: [part('let x: number')], documentation: [] } as unknown as QuickInfo
        const dom = renderQuickInfo(qi)
        expect(dom.querySelector('.cm-quickinfo-sig')!.textContent).toBe('let x: number')
        expect(dom.querySelector('.cm-quickinfo-doc')).toBeNull()
    })

    it('tags(@param/@returns)渲成带名 tag 行', () => {
        const qi = {
            displayParts: [part('function add(a: number, b: number): number')],
            tags: [
                { name: 'param', text: [part('a', 'parameterName'), part(' 加数')] },
                { name: 'returns', text: [part('和')] },
            ],
        } as unknown as QuickInfo
        const dom = renderQuickInfo(qi)
        const tags = dom.querySelectorAll('.cm-quickinfo-tag')
        expect(tags.length).toBe(2)
        expect(tags[0].querySelector('.cm-qi-tagname')!.textContent).toBe('@param')
        // Monaco tagToString:*@param*`a` — 加数
        expect(tags[0].querySelector('code.cm-qi-paramname')!.textContent).toBe('a')
        // 第六轮 H:照 tagToString 原样拼(' — ' + 其余 part 按空格拼),所以是两个空格,浏览器渲染时折叠
        expect(tags[0].textContent).toBe('@parama —  加数')
        expect(tags[1].querySelector('.cm-qi-tagname')!.textContent).toBe('@returns')
    })
})

describe('bumpVersion —— 文本变才递增', () => {
    it('文本相同不递增', () => {
        expect(bumpVersion('abc', 3, 'abc')).toBe(3)
    })
    it('文本变则 +1', () => {
        expect(bumpVersion('abc', 3, 'abcd')).toBe(4)
    })
})

describe('tsQuickInfoSource —— 驱动 LanguageService', () => {
    it('本地符号 hover 出 displayParts', async () => {
        clearTSServiceCache()
        const src = tsQuickInfoSource({ lang: 'typescript', fileName: '/qi-src.ts' })
        const doc = 'const hello = 1\nhello\n'
        const pos = doc.lastIndexOf('hello')
        const state = EditorState.create({ doc })
        const r = await Promise.resolve(src(state, pos, 1))
        expect(r).not.toBeNull()
        expect(r!.create().textContent).toMatch(/hello/)
    }, 60_000)

    it('带 JSDoc 的函数 hover 出文档块', async () => {
        clearTSServiceCache()
        const src = tsQuickInfoSource({ lang: 'typescript', fileName: '/qi-doc.ts' })
        const doc = '/** sum two numbers */\nfunction add(a: number, b: number) { return a + b }\nadd\n'
        const pos = doc.lastIndexOf('add')
        const state = EditorState.create({ doc })
        const r = await Promise.resolve(src(state, pos, 1))
        expect(r).not.toBeNull()
        const el = r!.create()
        expect(el.querySelector('.cm-quickinfo-doc')?.textContent ?? el.textContent).toMatch(/sum two numbers|add/)
    }, 60_000)

    it('真 LS 的 @param/@returns 进 tag 行', async () => {
        clearTSServiceCache()
        const src = tsQuickInfoSource({ lang: 'typescript', fileName: '/qi-tags.ts' })
        const doc = '/**\n * add\n * @param a 加数\n * @returns 和\n */\nfunction add(a: number) { return a }\nadd\n'
        const pos = doc.lastIndexOf('add')
        const state = EditorState.create({ doc })
        const r = await Promise.resolve(src(state, pos, 1))
        expect(r).not.toBeNull()
        const el = r!.create()
        const tags = el.querySelectorAll('.cm-quickinfo-tag')
        expect(tags.length).toBeGreaterThan(0)
        const text = el.textContent ?? ''
        expect(text.includes('@param') || text.includes('加数')).toBe(true)
        expect(text.includes('@returns') || text.includes('和')).toBe(true)
    }, 60_000)
})

describe('tsDiagnosticToLit —— 驱动 LanguageService', () => {
    it('语义诊断映到区间 + source:ts', async () => {
        clearTSServiceCache()
        const session = getTSService({ lang: 'typescript', fileName: '/bad-src.ts' })
        const text = 'const x: number = "nope"\n'
        session.update(text)
        await session.ensure()
        // 主线程不持有 typescript:测试里自己取;服务返回 SlimDiagnostic(无 file.text,故显式传文档长度)
        const tsNs = await import('typescript')
        const tsMod = ((tsNs as { default?: typeof import('typescript') }).default ?? tsNs) as typeof import('typescript')
        const svc = session.service()
        const raw = [
            ...(await svc.getSyntacticDiagnostics(session.fileName) ?? []),
            ...(await svc.getSemanticDiagnostics(session.fileName) ?? []),
        ]
        const lits = raw.map(d => tsDiagnosticToLit(d as never, tsMod, session.fileName, text.length)).filter(d => d != null)
        const first = lits[0]
        if (!first) throw new Error('no mapped diagnostic')
        expect(first.source).toBe('ts')
        expect(first.to).toBeGreaterThan(first.from)
        expect(first.message).toBeTruthy()
    }, 60_000)
})
