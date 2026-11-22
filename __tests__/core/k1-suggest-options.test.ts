// K1:补全相关选项逐个行为测试(ISuggestOptions / IQuickSuggestionsOptions 及顶层 acceptSuggestion* 等)。
// 每个选项:非默认值 → 行为变;默认值 → 不变。token 类型(注释 / 字符串)靠 mock tokenTypeBefore 提供,
// 因为 jsdom 里没有 shiki 高亮缓存;真实 token 来源的接线(view/tokens)由 tokentype.ts 负责,这里测的是分档判断。
import { afterEach, describe, expect, it, vi } from 'vitest'

let mockTokenType = 0
vi.mock('../../src/core/feature/tokentype', async (orig) => {
    const real = await orig<typeof import('../../src/core/feature/tokentype')>()
    return { ...real, tokenTypeBefore: () => mockTokenType }
})

import { mountSuggest, cleanupSuggest, wait, until, type SuggestRig } from './_suggest-harness'
import { suggestNext, suggestAccept, suggestAcceptOnEnter, suggestAcceptAlternative, suggestTab, suggestLeaveSnippet, suggestClose } from '../../src/core/feature/suggestwidget'
import type { CompletionItemM, CompletionItemProvider } from '../../src/lang/providers'
import { CompletionItemKind } from '../../src/lang/providers'
import { getContextKeyService } from '../../src/api/contextkeys'
import { EditorSelection } from '../../src/core/model/selection'

afterEach(() => {
    mockTokenType = 0
    cleanupSuggest()
    document.querySelectorAll('.cm-completionList,.cm-completionDetails').forEach(n => n.remove())
})

// 旧引擎的「候选」形态,在这里翻成 provider 协议(Monaco CompletionItem):测试数据保持原样
interface Completion {
    label: string
    kind?: string
    snippet?: boolean
    apply?: string
    deprecated?: boolean
    detail?: string
    commitCharacters?: string[]
}
const KINDS: Record<string, CompletionItemKind> = {
    variable: CompletionItemKind.Variable, function: CompletionItemKind.Function, keyword: CompletionItemKind.Keyword, snippet: CompletionItemKind.Snippet,
}
type Src = CompletionItemProvider | null
const items = (list: Completion[]): Src => ({
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
        const until = model.getWordUntilPosition(position)
        const at = model.getWordAtPosition(position)
        const line = position.lineNumber
        const range = {
            insert: { startLineNumber: line, startColumn: until.startColumn, endLineNumber: line, endColumn: position.column },
            replace: { startLineNumber: line, startColumn: until.startColumn, endLineNumber: line, endColumn: at ? at.endColumn : position.column },
        }
        return {
            suggestions: list.map((c): CompletionItemM => ({
                label: c.label,
                kind: KINDS[c.kind ?? ''] ?? CompletionItemKind.Text,
                insertText: c.apply ?? c.label,
                insertTextRules: c.snippet ? 4 : 0,
                detail: c.detail,
                tags: c.deprecated ? [1] : undefined,
                commitCharacters: c.commitCharacters,
                range: range as never,
            })),
        }
    },
})
/** 文档词(内置 '*' provider):不注册任何 provider */
const WORDS: Src = null

function mount(text: string, sources: Src[], options: Record<string, unknown> = {}): SuggestRig {
    // provider 注册在全局表里:上一个编辑器的先卸掉,否则同一测试里 a / b 两个编辑器的候选会叠加(同一用例里前一个编辑器断言已完成)
    cleanupSuggest()
    const caret = text.indexOf('|')
    const doc = caret >= 0 ? text.slice(0, caret) + text.slice(caret + 1) : text
    const r = mountSuggest({
        doc, cursor: caret < 0 ? 0 : caret, options,
        providers: sources.filter((s): s is CompletionItemProvider => !!s).map(p => ['plaintext', p] as [string, CompletionItemProvider]),
    })
    // jsdom 没有布局:给个光标几何,列表才会显示
    ;(r.v as unknown as { caretCoords: unknown }).caretCoords = () => ({ left: 10, top: 10, bottom: 30, height: 20 })
    return r
}

async function settle(ms = 25) {
    await wait(ms)
    for (let i = 0; i < 6; i++) await wait(0)
    await new Promise(r => requestAnimationFrame(() => r(null)))
}
async function type(r: SuggestRig, text: string, ms = 25) {
    for (const ch of text) {
        r.type(ch)
        await settle(ms)
    }
}
type View = SuggestRig
const cs = (v: View) => ({ open: v.open, selected: v.selected })
const labels = (v: View) => v.labels
const run = (v: View, cmd: (t: never) => boolean) => cmd(v.v as never)
/** 显式触发并等结果 */
const runCompletion = async (v: View, _explicit = true) => { v.trigger(); await v.waitOpen(); await settle(5) }
const ALPHA: Completion[] = [{ label: 'alpha', kind: 'variable' }, { label: 'beta', kind: 'variable' }]

const inSnippet = (v: View) => !!getContextKeyService(v.v).getContextKeyValue<boolean>('inSnippetMode')
describe('quickSuggestions(按位置分档)', () => {
    it('默认(other on):打字弹出', async () => {
        const v = mount('|', [items(ALPHA)])
        await type(v, 'al')
        expect(labels(v)).toEqual(['alpha'])
    })
    it('false:全关,打字不弹;显式触发照常', async () => {
        const v = mount('|', [items(ALPHA)], { quickSuggestions: false })
        await type(v, 'al')
        expect(cs(v).open).toBe(false)
        await runCompletion(v, true)
        expect(labels(v)).toEqual(['alpha'])
    })
    it('{ other: "off" }:代码里不弹', async () => {
        const v = mount('|', [items(ALPHA)], { quickSuggestions: { other: 'off' } })
        await type(v, 'al')
        expect(cs(v).open).toBe(false)
    })
    it('注释:默认 off 不弹;comments:"on" 弹', async () => {
        mockTokenType = 1
        const a = mount('|', [items(ALPHA)])
        await type(a, 'al')
        expect(cs(a).open).toBe(false)
        const b = mount('|', [items(ALPHA)], { quickSuggestions: { comments: 'on' } })
        await type(b, 'al')
        expect(cs(b).open).toBe(true)
    })
    it('字符串:默认 off 不弹;strings:"on" 弹;"inline" 不算 on', async () => {
        mockTokenType = 2
        const a = mount('|', [items(ALPHA)])
        await type(a, 'al')
        expect(cs(a).open).toBe(false)
        const b = mount('|', [items(ALPHA)], { quickSuggestions: { strings: 'on' } })
        await type(b, 'al')
        expect(cs(b).open).toBe(true)
        const c = mount('|', [items(ALPHA)], { quickSuggestions: { strings: 'inline' } })
        await type(c, 'al')
        expect(cs(c).open).toBe(false)
    })
    it('正则按 other 算', async () => {
        mockTokenType = 3
        const v = mount('|', [items(ALPHA)])
        await type(v, 'al')
        expect(cs(v).open).toBe(true)
    })
    it('suggest.snippetsPreventQuickSuggestions(Monaco 默认 false):片段会话里照弹;设 true 才不弹', async () => {
        const snip: Completion[] = [{ label: 'fn', snippet: true, apply: 'f(${1:x})$0' }]
        for (const [opt, expectOpen] of [[{}, true], [{ suggest: { snippetsPreventQuickSuggestions: true } }, false]] as const) {
            const v = mount('|', [items([...snip, ...ALPHA])], opt)
            await runCompletion(v, true)
            v.v.dispatch(v.v.state.update({ selection: EditorSelection.cursor(0) }))
            const fn = v.labels.indexOf('fn')
            for (let i = 0; i < fn; i++) run(v, suggestNext)
            run(v, suggestAccept)
            expect(inSnippet(v)).toBe(true)
            v.v.dispatch(v.v.state.update({ changes: { from: v.v.state.selection.main.head, insert: ' ' } }))
            await type(v, 'al')
            expect(cs(v).open).toBe(expectOpen)
        }
    })
})

describe('quickSuggestionsDelay', () => {
    it('默认 10ms:打字后很快弹出', async () => {
        const v = mount('|', [items(ALPHA)])
        await type(v, 'al', 30)
        expect(cs(v).open).toBe(true)
    })
    it('200ms:延迟之前不弹,到点才弹', async () => {
        const v = mount('|', [items(ALPHA)], { quickSuggestionsDelay: 200 })
        await type(v, 'al', 30)
        expect(cs(v).open).toBe(false)
        await settle(250)
        expect(cs(v).open).toBe(true)
    })
})

describe('suggestOnTriggerCharacters', () => {
    const members: Completion[] = [{ label: 'push' }, { label: 'pop' }]
    it('默认 true:打 . 弹成员', async () => {
        const v = mount('arr|', [items(members)])
        await type(v, '.')
        expect(labels(v)).toEqual(['push', 'pop'].sort())
    })
    it('false:打 . 不弹', async () => {
        const v = mount('arr|', [items(members)], { suggestOnTriggerCharacters: false })
        await type(v, '.')
        expect(cs(v).open).toBe(false)
    })
})

describe('acceptSuggestionOnEnter', () => {
    const open = async (opt: Record<string, unknown>, typed = 'al', list = ALPHA) => {
        const v = mount('|', [items(list)], opt)
        await type(v, typed)
        return v
    }
    it("'on'(默认):Enter 接受", async () => {
        const v = await open({})
        expect(run(v, suggestAcceptOnEnter)).toBe(true)
        expect(v.doc).toBe('alpha')
    })
    it("'off':Enter 不接受(返回 false 交给换行)", async () => {
        const v = await open({ acceptSuggestionOnEnter: 'off' })
        expect(run(v, suggestAcceptOnEnter)).toBe(false)
        expect(v.doc).toBe('al')
    })
    it("'smart':接受会改字时接受;候选等于已打的词时不接受", async () => {
        const a = await open({ acceptSuggestionOnEnter: 'smart' })
        expect(run(a, suggestAcceptOnEnter)).toBe(true)
        const b = await open({ acceptSuggestionOnEnter: 'smart' }, 'alpha')
        expect(run(b, suggestAcceptOnEnter)).toBe(false)
        const c = await open({}, 'alpha')
        expect(run(c, suggestAcceptOnEnter)).toBe(true)
    })
})

describe('acceptSuggestionOnCommitCharacter', () => {
    const list: Completion[] = [{ label: 'alpha', commitCharacters: ['.'] }]
    it('默认 true:打提交字符先接受再输入', async () => {
        const v = mount('|', [items(list)])
        await type(v, 'al')
        await type(v, '.')
        expect(v.doc).toBe('alpha.')
    })
    it('false:提交字符只是普通输入', async () => {
        const v = mount('|', [items(list)], { acceptSuggestionOnCommitCharacter: false })
        await type(v, 'al')
        await type(v, '.')
        expect(v.doc).toBe('al.')
    })
})

describe('tabCompletion', () => {
    it("默认 'off':没有列表时 Tab 不取候选", () => {
        const v = mount('al|', [items(ALPHA)])
        expect(run(v, suggestTab)).toBe(false)
        expect(run(v, suggestTab)).toBe(false)
        expect(v.doc).toBe('al')
    })
    it("'on':没有列表时 Tab 直接插入最优候选", async () => {
        const v = mount('al|', [items(ALPHA)], { tabCompletion: 'on' })
        expect(run(v, suggestTab)).toBe(true)
        // Monaco triggerSuggestAndAcceptBest 是异步的:取到候选后才落字
        await until(() => v.doc === 'alpha', 1000)
        expect(v.doc).toBe('alpha')
    })
    it("'on':候选就是已打的词 → 回落成普通 Tab(Monaco triggerSuggestAndAcceptBest 异步回落到 tab 命令:文档只多一个缩进,不重复插候选)", async () => {
        const v = mount('alpha|', [items(ALPHA)], { tabCompletion: 'on' })
        run(v, suggestTab)
        await until(() => v.doc !== 'alpha', 1000)
        expect(v.doc.startsWith('alpha')).toBe(true)
        expect(v.doc.slice(5).trim()).toBe('')
        expect(v.doc.length).toBeGreaterThan(5)
    })
})

describe('snippetSuggestions', () => {
    const list: Completion[] = [
        { label: 'forEach', kind: 'function' },
        { label: 'for', kind: 'snippet', snippet: true, apply: 'for ($1) {}' },
        { label: 'format', kind: 'function' },
    ]
    const labelsFor = async (opt: Record<string, unknown>) => {
        const v = mount('fo|', [items(list)], opt)
        await runCompletion(v, true)
        return labels(v)
    }
    it("'top':片段排最前", async () => { expect((await labelsFor({ snippetSuggestions: 'top' }))[0]).toBe('for') })
    it("'bottom':片段排最后", async () => { expect((await labelsFor({ snippetSuggestions: 'bottom' })).at(-1)).toBe('for') })
    it("'none':不列片段", async () => { expect(await labelsFor({ snippetSuggestions: 'none' })).not.toContain('for') })
    it("'inline'(默认):片段按分数混排", async () => {
        const l = await labelsFor({})
        expect(l).toContain('for')
        expect(l[0]).toBe('for') // 完全匹配的 for 分最高
    })
})

describe('suggestSelection', () => {
    const list: Completion[] = [{ label: 'sel_a' }, { label: 'sel_b' }, { label: 'sel_c' }]
    it("默认 'first':总是第一项", async () => {
        const v = mount('|', [items(list)])
        await runCompletion(v, true)
        expect(cs(v).selected).toBe(0)
    })
    it("'recentlyUsed':上次接受过的项,下次排在选中位", async () => {
        const v = mount('|', [items(list)], { suggestSelection: 'recentlyUsed' })
        await runCompletion(v, true)
        run(v, suggestNext)
        run(v, suggestAccept)
        expect(v.doc).toBe('sel_b')
        v.v.dispatch(v.v.state.update({ changes: { from: 0, to: v.v.state.doc.length, insert: '' }, selection: EditorSelection.cursor(0) }))
        run(v, suggestClose)
        await runCompletion(v, true)
        expect(v.labels[v.selected]).toBe('sel_b')
    })
})

describe('suggest.filterGraceful / matchOnWordStartOnly', () => {
    it('filterGraceful 默认 true:颠倒两个字母也能命中(fro → forEach;Monaco 只对 ≥3 个字符的前缀容错)', async () => {
        const v = mount('fro|', [items([{ label: 'forEach' }])])
        await runCompletion(v, true)
        expect(labels(v)).toEqual(['forEach'])
    })
    it('filterGraceful:false:不容错', async () => {
        const v = mount('fro|', [items([{ label: 'forEach' }])], { suggest: { filterGraceful: false } })
        await runCompletion(v, true)
        expect(labels(v)).toEqual([])
    })
    it('matchOnWordStartOnly 默认 true:词中间命中不算(fo 不配 xfoo)', async () => {
        const v = mount('fo|', [items([{ label: 'xfoo' }])])
        await runCompletion(v, true)
        expect(labels(v)).toEqual([])
    })
    it('matchOnWordStartOnly:false:词中间也配', async () => {
        const v = mount('fo|', [items([{ label: 'xfoo' }])], { suggest: { matchOnWordStartOnly: false } })
        await runCompletion(v, true)
        expect(labels(v)).toEqual(['xfoo'])
    })
})

describe('suggest.show* / showDeprecated / showWords / wordBasedSuggestions', () => {
    it('showFunctions:false 隐藏 function,默认显示', async () => {
        const list: Completion[] = [{ label: 'aFn', kind: 'function' }, { label: 'aVar', kind: 'variable' }]
        const a = mount('a|', [items(list)])
        await runCompletion(a, true)
        expect(labels(a).sort()).toEqual(['aFn', 'aVar'])
        const b = mount('a|', [items(list)], { suggest: { showFunctions: false } })
        await runCompletion(b, true)
        expect(labels(b)).toEqual(['aVar'])
    })
    it('showKeywords:false 隐藏关键字', async () => {
        const list: Completion[] = [{ label: 'async', kind: 'keyword' }, { label: 'aVar', kind: 'variable' }]
        const v = mount('a|', [items(list)], { suggest: { showKeywords: false } })
        await runCompletion(v, true)
        expect(labels(v)).toEqual(['aVar'])
    })
    it('showSnippets:false 隐藏片段', async () => {
        const list: Completion[] = [{ label: 'aSnip', kind: 'snippet', snippet: true }, { label: 'aVar', kind: 'variable' }]
        const v = mount('a|', [items(list)], { suggest: { showSnippets: false } })
        await runCompletion(v, true)
        expect(labels(v)).toEqual(['aVar'])
    })
    it('showDeprecated:false 隐藏废弃项,默认显示', async () => {
        const list: Completion[] = [{ label: 'aOld', deprecated: true }, { label: 'aNew' }]
        const a = mount('a|', [items(list)])
        await runCompletion(a, true)
        expect(labels(a).sort()).toEqual(['aNew', 'aOld'])
        const b = mount('a|', [items(list)], { suggest: { showDeprecated: false } })
        await runCompletion(b, true)
        expect(labels(b)).toEqual(['aNew'])
    })
    it('默认给文档词', async () => {
        const a = mount('alpha al|', [WORDS])
        await runCompletion(a, true)
        expect(labels(a)).toEqual(['alpha'])
    })
    it('suggest.showWords:false 不给文档词', async () => {
        const v = mount('alpha al|', [WORDS], { suggest: { showWords: false } })
        await runCompletion(v, true)
        expect(labels(v)).toEqual([])
    })
})

describe('suggest.insertMode / Shift+Enter(acceptAlternativeSelectedSuggestion)', () => {
    const list: Completion[] = [{ label: 'alpha' }]
    it("insert(默认):接受只替换光标前的前缀;Shift+Enter 反过来替换整词", async () => {
        const a = mount('al|xyz', [items(list)])
        await runCompletion(a, true)
        run(a, suggestAccept)
        expect(a.doc).toBe('alphaxyz')
        const b = mount('al|xyz', [items(list)])
        await runCompletion(b, true)
        run(b, suggestAcceptAlternative)
        expect(b.doc).toBe('alpha')
    })
    it('replace:接受替换整词;Shift+Enter 反过来只插入', async () => {
        const a = mount('al|xyz', [items(list)], { suggest: { insertMode: 'replace' } })
        await runCompletion(a, true)
        run(a, suggestAccept)
        expect(a.doc).toBe('alpha')
        const b = mount('al|xyz', [items(list)], { suggest: { insertMode: 'replace' } })
        await runCompletion(b, true)
        run(b, suggestAcceptAlternative)
        expect(b.doc).toBe('alphaxyz')
    })
})

describe('leaveSnippet(Esc / Shift+Esc)', () => {
    it('片段会话里退出:占位符选区收成一个光标;不在片段里返回 false', async () => {
        const v = mount('|', [items([{ label: 'fn', snippet: true, apply: 'f(${1:a}, ${2:b})$0' }])])
        expect(run(v, suggestLeaveSnippet)).toBe(false)
        await runCompletion(v, true)
        run(v, suggestAccept)
        expect(inSnippet(v)).toBe(true)
        expect(run(v, suggestLeaveSnippet)).toBe(true)
        expect(inSnippet(v)).toBe(false)
        expect(v.v.state.selection.ranges.length).toBe(1)
    })
})

describe('列表外观选项(DOM)', () => {
    const open = async (opt: Record<string, unknown>, list: Completion[] = [{ label: 'alpha', kind: 'function', detail: 'detail-text' }]) => {
        const v = mount('al|', [items(list)], opt)
        await runCompletion(v, true)
        await wait(20)
        return v
    }
    const rows = () => [...document.querySelectorAll<HTMLElement>('.cm-completionItem')]
    it('suggest.showIcons 默认 true 有图标;false 无', async () => {
        await open({})
        expect(rows()[0].querySelector('.cm-completionIcon')).not.toBeNull()
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
        await open({ suggest: { showIcons: false } })
        expect(rows()[0].querySelector('.cm-completionIcon')).toBeNull()
    })
    it('suggest.showInlineDetails 默认 true 行内有 detail;false 无', async () => {
        await open({})
        expect(rows()[0].querySelector('.cm-completionDetail')).not.toBeNull()
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
        await open({ suggest: { showInlineDetails: false } })
        expect(rows()[0].querySelector('.cm-completionDetail')).toBeNull()
    })
    it('suggestLineHeight:0 = 跟编辑器;设值 clamp(8, 1000)', async () => {
        await open({ suggestLineHeight: 30 })
        expect(rows()[0].style.height).toBe('30px')
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
        await open({ suggestLineHeight: 2 })
        expect(rows()[0].style.height).toBe('8px')
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
        await open({})
        expect(rows()[0].style.height).not.toBe('30px')
    })
    it('suggestFontSize:设值时行字号改变,0 跟编辑器', async () => {
        await open({ suggestFontSize: 18 })
        expect(rows()[0].style.fontSize).toBe('18px')
        document.querySelectorAll('.cm-completionList').forEach(n => n.remove())
        await open({})
        expect(rows()[0].style.fontSize).not.toBe('18px')
    })
})
