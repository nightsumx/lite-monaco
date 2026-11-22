// 补全(真实路径):provider 注册表 → SuggestModel → SuggestController → SuggestUi(core 下拉控件的状态)。
// 旧引擎(completionField / completionSources / autocompleteOnInput …)已删,这里的断言全部跑在 liteMonaco() 挂出的真编辑器上。
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import {
    suggestAccept, suggestClose, suggestNext, suggestPrev, suggestPageNext, suggestPagePrev, suggestTab, suggestTrigger,
} from '../../src/core/feature/suggestwidget'
import { fuzzyScore, matchIndices } from '../../src/core/feature/fuzzy'
import { LineContext } from '../../src/lang/suggestmodel'
import { providerModel, type CompletionItemProvider } from '../../src/lang/providers'
import { textCompletionProvider } from '../../src/lang/suggestproviders'
import { mountSuggest, cleanupSuggest, until, wait, type SuggestRig } from './_suggest-harness'

afterEach(cleanupSuggest)

/** 把一组 label 做成 provider(range = 光标前的词) */
function labelsProvider(items: { label: string, kind?: number, insertText?: string, snippet?: boolean, commitCharacters?: string[] }[]): CompletionItemProvider {
    return {
        provideCompletionItems(model, position) {
            const w = model.getWordUntilPosition(position)
            const range = { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column }
            return { suggestions: items.map(i => ({ label: i.label, kind: i.kind ?? 17, insertText: i.insertText ?? i.label, insertTextRules: i.snippet ? 4 : 0, commitCharacters: i.commitCharacters, range })) }
        },
    }
}

/** 显式触发并等到出现列表(或提示行) */
async function open(r: SuggestRig): Promise<void> {
    suggestTrigger(r.v)
    await r.waitOpen()
    await until(() => r.listed || r.ui.state.message === 'empty')
}
/** 方向键移到指定 label */
function moveTo(r: SuggestRig, label: string): void {
    for (let i = 0; i < r.ui.state.count && r.labels[r.selected] !== label; i++) suggestNext(r.v)
}

describe('词前缀(旧 prefixRange)', () => {
    it('取光标左侧词前缀', () => {
        const r = mountSuggest({ doc: 'function', cursor: 3 })
        expect(r.v.getModel()!.getWordUntilPosition({ lineNumber: 1, column: 4 })).toMatchObject({ word: 'fun', startColumn: 1, endColumn: 4 })
    })

    it('空白处没有前缀词', () => {
        const r = mountSuggest({ doc: 'ab cd', cursor: 3 }) // 空格后
        expect(r.v.getModel()!.getWordUntilPosition({ lineNumber: 1, column: 4 }).word).toBe('')
    })
})

describe('文档词 provider(旧 documentWordSource)', () => {
    const run = (doc: string, offset: number, explicit: boolean, lang = 'plaintext') => {
        const state = EditorState.create({ doc, selection: EditorSelection.single(offset) })
        const model = providerModel(() => state, lang)
        const p = textCompletionProvider(() => state, () => explicit)
        return p.provideCompletionItems(model, model.getPositionAt(offset), { triggerKind: 0 }, undefined as never) as { suggestions: { label: unknown }[] } | null
    }

    it('提取文档中已有词作为补全项', () => {
        const result = run('function funny bar fooBar', 2, true)
        expect(result).not.toBeNull()
        expect(result!.suggestions.some(c => c.label === 'funny')).toBe(true)
        // 光标所在词本身不进候选(Monaco $textualSuggest: word === getWordAtPosition 跳过)
        expect(result!.suggestions.some(c => c.label === 'function')).toBe(false)
    })

    it('自动触发前缀空返回 null', () => {
        expect(run('foo', 0, false)).toBeNull()
    })

    it('显式空前缀可列出文档词', () => {
        const result = run(' alpha beta gamma', 0, true)
        expect(result).not.toBeNull()
        expect(result!.suggestions.map(c => c.label)).toContain('alpha')
    })

    it('大文档不卡:3 万行扫描有预算', () => {
        const doc = 'const uniqueWordXYZ = 1\n'.repeat(30_000) + 'uni'
        const state = EditorState.create({ doc })
        const model = providerModel(() => state, 'plaintext')
        const p = textCompletionProvider(() => state, () => false)
        const pos = model.getPositionAt(state.doc.length)
        const t0 = performance.now()
        const result = p.provideCompletionItems(model, pos, { triggerKind: 0 }, undefined as never) as { suggestions: { label: unknown }[] } | null
        const ms = performance.now() - t0
        expect(ms).toBeLessThan(80)
        expect(result?.suggestions.some(c => c.label === 'uniqueWordXYZ')).toBe(true)
    })
})

describe('关键字(同一个文本 provider,按语言出关键字)', () => {
    const run = (lang: string, doc: string, offset: number, explicit: boolean) => {
        const state = EditorState.create({ doc, selection: EditorSelection.single(offset) })
        const model = providerModel(() => state, lang)
        const p = textCompletionProvider(() => state, () => explicit)
        const res = p.provideCompletionItems(model, model.getPositionAt(offset), { triggerKind: 0 }, undefined as never) as { suggestions: { label: string }[] } | null
        return res?.suggestions ?? null
    }

    it('ts: fun 前缀命中 function', () => {
        expect(run('typescript', 'fun', 3, false)?.some(c => c.label === 'function')).toBe(true)
    })

    it('显式空前缀列出关键字', () => {
        const list = run('typescript', ' ', 0, true)
        expect(list?.length).toBeGreaterThan(0)
        expect(list?.some(c => c.label === 'function')).toBe(true)
    })

    it('python: de 前缀命中 def', () => {
        expect(run('python', 'de', 2, false)?.some(c => c.label === 'def')).toBe(true)
    })

    it('未知语言没有关键字源', () => {
        expect(run('rust', 'fn', 2, true)).toBeNull()
    })
})

describe('触发补全(editor.action.triggerSuggest)', () => {
    it('启动补全:打开下拉', async () => {
        const r = mountSuggest({ doc: 'function foo\nfun' })
        await open(r)
        expect(r.listed).toBe(true)
        expect(r.ui.state.count).toBeGreaterThan(0)
        // 再按一次:切详情,下拉仍开着(Monaco toggleSuggestionDetails)
        expect(suggestTrigger(r.v)).toBe(true)
        expect(r.open).toBe(true)
    })

    it('无补全项:显式触发出 No suggestions. 提示行(Monaco State.Empty)', async () => {
        const r = mountSuggest({ doc: 'x' })
        suggestTrigger(r.v)
        await until(() => r.ui.state.message === 'empty')
        expect(r.open).toBe(true)
        expect(r.ui.state.message).toBe('empty')
        expect(r.labels).toEqual([])
    })

    it('snippet 候选:for 接受后展开循环', async () => {
        const r = mountSuggest({
            doc: 'for',
            providers: [['plaintext', labelsProvider([{ label: 'for', kind: 28, snippet: true, insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}' }])]],
        })
        await open(r)
        expect(r.labels).toContain('for')
        moveTo(r, 'for')
        expect(suggestAccept(r.v)).toBe(true)
        expect(r.doc).toContain('for (let ')
        expect(r.doc).toContain('++')
    })

    it('关键字+文档词:de 优先 def', async () => {
        const r = mountSuggest({ doc: 'de', lang: 'python' })
        await open(r)
        expect(r.labels[0]).toBe('def')
    })
})

describe('接受补全', () => {
    it('只替换前缀 [from,head]', async () => {
        const r = mountSuggest({ doc: 'function\nfu' })
        await open(r)
        expect(r.listed).toBe(true)
        expect(r.labels).toContain('function')
        moveTo(r, 'function')
        expect(suggestAccept(r.v)).toBe(true)
        expect(r.doc).toBe('function\nfunction')
        expect(r.open).toBe(false)
    })

    it('接受不吃光标右侧字符', async () => {
        // 文档: funEXTRA, 光标在 3;insert 模式只替 fun
        const r = mountSuggest({ doc: 'funEXTRA functionality', cursor: 3 })
        await open(r)
        expect(r.labels).toContain('functionality')
        moveTo(r, 'functionality')
        suggestAccept(r.v)
        expect(r.doc).toBe('functionalityEXTRA functionality')
    })

    it('补全未打开:返回 false', () => {
        const r = mountSuggest({ doc: 'hello', cursor: 0 })
        expect(suggestAccept(r.v)).toBe(false)
    })
})

describe('next/prev/page', () => {
    it('next:选中项下移', async () => {
        const r = mountSuggest({ doc: 'function foo fooBar\nf' })
        await open(r)
        const initial = r.selected
        suggestNext(r.v)
        expect(r.selected).toBe((initial + 1) % r.ui.state.count)
    })

    // Monaco 列表翻页(12 行可见):先跳到视口末行,已在末行再翻一屏;到头停住,不环绕
    const many = Array.from({ length: 30 }, (_, i) => `w${String(i).padStart(2, '0')}x`).join(' ') + '\nw'
    it('pageNext:0 → 11 → 23 → 29 → 29(不环绕)', async () => {
        const r = mountSuggest({ doc: many })
        await open(r)
        expect(r.ui.state.count).toBe(30)
        expect(r.selected).toBe(0)
        const seen: number[] = []
        for (let i = 0; i < 4; i++) {
            expect(suggestPageNext(r.v)).toBe(true)
            seen.push(r.selected)
        }
        expect(seen).toEqual([11, 23, 29, 29])
    })

    it('pagePrev:对称,0 处不环绕到尾', async () => {
        const r = mountSuggest({ doc: many })
        await open(r)
        expect(suggestPagePrev(r.v)).toBe(true)
        expect(r.selected).toBe(0)
        suggestPageNext(r.v); suggestPageNext(r.v) // 23,scrollTop 242(视口 12.1..24.2)
        expect(r.selected).toBe(23)
        // Monaco focusPreviousPage:首行 = indexAt(scrollTop - 1) + 1,半露的第 12 行不算 → 13
        suggestPagePrev(r.v)
        expect(r.selected).toBe(13)
        suggestPagePrev(r.v)
        expect(r.selected).toBe(0)
    })

    it('未打开 pageNext 返 false', () => {
        const r = mountSuggest({ doc: 'hello', cursor: 0 })
        expect(suggestPageNext(r.v)).toBe(false)
    })

    it('打空格关掉下拉,词不被替换(旧 closeCompletionOnSpace)', async () => {
        const r = mountSuggest({ doc: 'function\nfu' })
        await open(r)
        expect(r.open).toBe(true)
        r.type(' ')
        expect(r.open).toBe(false)
        expect(r.doc).toBe('function\nfu ')
    })

    it('Tab 无 snippet 时接受当前项', async () => {
        const r = mountSuggest({ doc: 'function\nfu' })
        await open(r)
        moveTo(r, 'function')
        expect(suggestTab(r.v)).toBe(true)
        expect(r.doc).toBe('function\nfunction')
        expect(r.open).toBe(false)
    })

    it('prev:选中项上移(环绕)', async () => {
        const r = mountSuggest({ doc: 'function foo fooBar\nf' })
        await open(r)
        const initial = r.selected
        const n = r.ui.state.count
        suggestPrev(r.v)
        expect(r.selected).toBe((initial - 1 + n) % n)
    })

    it('补全未打开:返回 false', () => {
        const r = mountSuggest({ doc: 'hello', cursor: 0 })
        expect(suggestNext(r.v)).toBe(false)
        expect(suggestPrev(r.v)).toBe(false)
    })
})

describe('refilter:就地过滤不丢选中', () => {
    it('输入后保持 open,前缀收窄 options', async () => {
        const r = mountSuggest({ doc: 'function fooBar\n' })
        r.type('f')
        await r.waitOpen()
        expect(r.open).toBe(true)
        const n1 = r.ui.state.count
        r.type('u')
        await wait(30)
        expect(r.open).toBe(true)
        expect(r.ui.state.count).toBeLessThanOrEqual(n1)
        expect(r.labels.every(l => l.toLowerCase().includes('fu'))).toBe(true)
    })

    it('doc 变更 type 时保持 open(不闪关),定位锚跟到新光标', async () => {
        const r = mountSuggest({ doc: 'function\nf' })
        await open(r)
        expect(r.open).toBe(true)
        r.type('u')
        await wait(30)
        expect(r.open).toBe(true)
        expect(r.ui.state.to).toBe(11)
    })

    it('refilter 后焦点回到第 0 项', async () => {
        const doc = 'alpha alphabet alpine\na'
        const r = mountSuggest({ doc })
        await open(r)
        expect(r.labels).toEqual(expect.arrayContaining(['alpha', 'alphabet', 'alpine']))
        moveTo(r, 'alphabet')
        expect(r.labels[r.selected]).toBe('alphabet')
        r.type('l') // 前缀 al
        await wait(30)
        expect(r.labels).toEqual(expect.arrayContaining(['alpha', 'alphabet', 'alpine']))
        expect(r.selected).toBe(0)
    })
})

describe('输入自动触发(quick suggestions)', () => {
    it('input.type + 词前缀 → 自动打开', async () => {
        const r = mountSuggest({ doc: 'function\n' })
        r.type('fun')
        await r.waitOpen()
        expect(r.labels).toContain('function')
    })

    it('已打开时退格 refilter 保持 open', async () => {
        const r = mountSuggest({ doc: 'function\nfun' })
        r.type('c')
        await r.waitOpen()
        expect(r.open).toBe(true)
        r.v.trigger('keyboard', 'deleteLeft', {})
        await wait(30)
        expect(r.open).toBe(true)
        expect(r.labels).toContain('function')
    })

    it('未打开时退格绝不新开(对齐 Monaco)', async () => {
        const r = mountSuggest({ doc: 'function\nfun' })
        expect(r.open).toBe(false)
        r.v.trigger('keyboard', 'deleteLeft', {})
        await wait(100)
        expect(r.open).toBe(false)
    })

    it('空格不弹', async () => {
        const r = mountSuggest({ doc: 'function ', cursor: 8 })
        r.type(' ')
        await wait(100)
        expect(r.open).toBe(false)
    })

    it('标点不弹(非成员点)', async () => {
        const r = mountSuggest({ doc: 'function' })
        r.type(';')
        await wait(100)
        expect(r.open).toBe(false)
    })

    it('纯数字不弹(对齐 Monaco:123 不触发补全)', async () => {
        const r = mountSuggest({ doc: 'const x = ' })
        r.type('1')
        await wait(100)
        expect(r.open).toBe(false)
        r.type('23')
        await wait(100)
        expect(r.open).toBe(false)
    })

    it('标识符前缀允许数字后缀(a1),纯数字前缀禁止(LineContext.shouldAutoTrigger)', () => {
        const should = (word: string) => LineContext.shouldAutoTrigger(mountSuggest({ doc: word }).v)
        expect(should('123')).toBe(false)
        expect(should('1')).toBe(false)
        expect(should('foo')).toBe(true)
        expect(should('a1')).toBe(true)
        expect(should('_x')).toBe(true)
    })
})

describe('关闭补全', () => {
    it('关闭补全', async () => {
        const r = mountSuggest({ doc: 'function foo\nfu' })
        await open(r)
        expect(r.open).toBe(true)
        suggestClose(r.v)
        expect(r.open).toBe(false)
    })

    it('无补全打开时返 false(让 Escape 落到 simplifySelection)', () => {
        const r = mountSuggest({ doc: 'function foo', cursor: 3 })
        expect(r.open).toBe(false)
        expect(suggestClose(r.v)).toBe(false)
    })
})

describe('提交字符(CommitCharacterController)', () => {
    const withItems = (cc?: string[]) => mountSuggest({
        doc: 'function\nfu',
        options: { autoClosingBrackets: 'never' }, // 排除自动配对括号对 doc 的干扰,只测提交字符
        providers: [['plaintext', labelsProvider([{ label: 'function', commitCharacters: cc }])]],
    })

    it('没有 commitCharacters 的候选:任何字符都不提交(Monaco TS 源不给提交符)', async () => {
        for (const ch of ['.', ',', '(', 'a']) {
            const r = withItems()
            await open(r)
            r.type(ch)
            expect(r.doc, ch).toBe(`function\nfu${ch}`)
        }
    })

    it('声明了提交符的候选:打出该字符先接受再写入', async () => {
        const r = withItems(['.', '('])
        await open(r)
        r.type('.')
        expect(r.doc).toBe('function\nfunction.')
        const r2 = withItems(['.', '('])
        await open(r2)
        r2.type(',')
        expect(r2.doc).toBe('function\nfu,')
    })

    it('空格:补全关掉,词不被替换', async () => {
        const r = mountSuggest({ doc: 'function\nfu', lang: 'python' })
        await open(r)
        expect(r.open).toBe(true)
        r.type(' ')
        expect(r.open).toBe(false)
        expect(r.doc).toBe('function\nfu ')
    })
})

describe('模糊匹配(fuzzyScore)', () => {
    it('ob 命中 onbeforeinput 子序列', () => {
        const m = fuzzyScore('ob', 'ob', 0, 'onbeforeinput', 'onbeforeinput', 0)
        expect(matchIndices(m).length).toBe(2)
    })
})
