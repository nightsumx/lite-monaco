// 第六轮 H 组:TS hover 细节照 Monaco 0.52(monaco-editor/esm/vs/language/typescript/tsMode.js)。
// - 诊断码:tsMode _convertDiagnostics 给 marker `code: diag.code.toString()`、不带 source;
//   markerHoverParticipant 渲 `source && code ? source(code) : source ? source : (code)` → `(6387)`,不是 `ts(6387)`。
// - QuickInfoAdapter.provideHover:文档 = displayPartsToString(documentation)(各 part.text 直接拼接,{@link X} 原样保留),
//   标签 = tags.map(tagToString).join('  \n\n'),两者用 '\n\n' 接成一份 markdown 一起渲染。
//   所以每个 @tag 是一个段落(和正文段落同样 8px 间距),多行说明是软换行(并进同一段),不另起块。
// 实测 /tmp/lc-hunt/r6/H/tsdoc-probe.ts(DOC=1 / DOC=2),截图 tsdoc*-{before,after}-{M,L}.png。
import { describe, expect, it } from 'vitest'
import { renderQuickInfo } from '../../src/lang/tsquickinfo'
import { tsDiagnosticToLit } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache, getTSService } from '../../src/lang/tsservice'
import type { QuickInfo, SymbolDisplayPart } from 'typescript'

const part = (text: string, kind = 'text'): SymbolDisplayPart => ({ text, kind })
const sig = [part('function add(a: number, b: number): number')]

describe('诊断码显示成 (code)', () => {
    it('tsDiagnosticToLit → code "(2322)"', async () => {
        clearTSServiceCache()
        const session = getTSService({ lang: 'typescript', fileName: '/r6-code.ts' })
        const text = 'const x: number = "nope"\n'
        session.update(text)
        await session.ensure()
        // 主线程不持有 typescript:测试里自己取;服务返回的是 SlimDiagnostic(无 file.text,故显式传文档长度)
        const tsNs = await import('typescript')
        const ts = ((tsNs as { default?: typeof import('typescript') }).default ?? tsNs) as typeof import('typescript')
        const diags = await session.service().getSemanticDiagnostics(session.fileName)
        const lits = diags.map(d => tsDiagnosticToLit(d as never, ts, session.fileName, text.length)).filter(d => d != null)
        expect(lits[0]!.code).toBe('(2322)')
    }, 60_000)
})

describe('renderQuickInfo 照 Monaco 的 markdown', () => {
    it('文档里的 {@link Math.max} 原样显示,不转成行内代码', () => {
        const qi = {
            displayParts: sig,
            documentation: [part('See '), part('{@link ', 'link'), part('Math.max', 'linkName'), part('}', 'link'), part(' and `x`.')],
        } as unknown as QuickInfo
        const doc = renderQuickInfo(qi).querySelector('.cm-quickinfo-doc')!
        expect(doc.textContent).toBe('See {@link Math.max} and x.')
        expect([...doc.querySelectorAll('code')].map(c => c.textContent)).toEqual(['x'])
    })

    it('标签里的 {@link} 也原样(tagToString 按空格拼 part)', () => {
        const qi = {
            displayParts: sig,
            tags: [{ name: 'param', text: [part('b', 'parameterName'), part(' ', 'space'), part('the second '), part('{@link ', 'link'), part('Math.min', 'linkName'), part('}', 'link')] }],
        } as unknown as QuickInfo
        const tag = renderQuickInfo(qi).querySelector('.cm-quickinfo-tag')!
        expect(tag.textContent!.replace(/\s+/g, ' ')).toBe('@paramb — the second {@link Math.min }')
        expect(tag.querySelectorAll('code').length).toBe(1) // 只有参数名
    })

    it('文档段落和每个 @tag 是同一份 markdown 里的兄弟段落', () => {
        const qi = {
            displayParts: sig,
            documentation: [part('Doc.')],
            tags: [
                { name: 'param', text: [part('a', 'parameterName'), part(' ', 'space'), part('- first line\ncontinues here')] },
                { name: 'returns', text: [part('the sum')] },
            ],
        } as unknown as QuickInfo
        const doc = renderQuickInfo(qi).querySelector('.cm-quickinfo-doc')!
        const ps = [...doc.children]
        expect(ps.map(p => p.tagName)).toEqual(['P', 'P', 'P'])
        // 多行说明 = 段内软换行,不另起块(原先是 margin-top:4px 的独立块 + 被误判成列表)
        expect(ps[1].textContent!.replace(/\s+/g, ' ')).toBe('@parama — - first line continues here')
        expect(ps[1].querySelector('ul, div')).toBeNull()
        expect(ps[1].classList.contains('cm-quickinfo-tag')).toBe(true)
        expect(ps[1].querySelector('em.cm-qi-tagname')!.textContent).toBe('@param')
        expect(ps[1].querySelector('code.cm-qi-paramname')!.textContent).toBe('a')
        expect(ps[2].textContent).toBe('@returns — the sum')
    })

    it('@example 的代码围栏照 Monaco 的拼法渲染(围栏不在行首 → 段落里的字面量,收尾围栏开新代码块)', () => {
        const qi = {
            displayParts: sig,
            tags: [
                { name: 'example', text: [part('```ts\nadd(1, 2)\n```')] },
                { name: 'returns', text: [part('the sum')] },
            ],
        } as unknown as QuickInfo
        const doc = renderQuickInfo(qi).querySelector('.cm-quickinfo-doc')!
        // Monaco 0.52 实测:「@example — ```ts add(1, 2)」一段,然后代码块里是字面的「*@returns* — the sum」
        expect(doc.children[0].textContent!.replace(/\s+/g, ' ')).toBe('@example — ```ts add(1, 2)')
        expect(doc.children[1].tagName).toBe('PRE')
        expect(doc.children[1].textContent!.trim()).toBe('*@returns* — the sum')
    })
})
