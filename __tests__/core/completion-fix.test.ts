// F4 补全修复:逐条对照 Monaco(TS 语言)的触发、过滤、排序、提交、外观、定位。
// 走真实路径:provider 注册表 → SuggestModel / SuggestController → SuggestUi(core overlay),不再碰旧引擎的 completionField。
// Monaco 真值来自 /tmp/lc-hunt/f4/mprobe*.ts 在 monaco-editor 0.52 上的实测。
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import {
    mountSuggest, cleanupSuggest, itemsProvider, splitCaret, provideTs, until, wait,
    type SuggestRig, type RigOptions,
} from './_suggest-harness'
import { getContextKeyService } from '../../src/api/contextkeys'
import { suggestNext, suggestPrev, suggestPageNext } from '../../src/core/feature/suggestwidget'
import type { CompletionItemProvider } from '../../src/lang/providers'

afterEach(() => {
    cleanupSuggest()
    document.querySelectorAll('.cm-completionList,.cm-completionDetails').forEach(n => n.remove())
})

let fileSeq = 0
const tsFile = (tag: string) => `/${tag}-${++fileSeq}.ts`

/** `a|b` 形式的 doc 挂编辑器(| 标光标);ts = true 挂 TypeScript(独立文件名) */
function mount(text: string, o: { ts?: string, providers?: [string, CompletionItemProvider][], options?: Record<string, unknown>, hl?: boolean } = {}): SuggestRig {
    const { doc, cursor } = splitCaret(text)
    const opts: RigOptions = { doc, cursor, providers: o.providers, options: o.options, highlighter: o.hl ? realHl : undefined }
    if (o.ts) { opts.lang = 'typescript'; opts.fileName = tsFile(o.ts) }
    return mountSuggest(opts)
}

/** 逐字打:每个字符一次真实按键(trigger('keyboard','type')),等 quickSuggestionsDelay(10ms)与异步 provider 落地 */
async function typeKeys(r: SuggestRig, text: string, ms = 45): Promise<void> {
    r.v.focus()
    for (const ch of text) { r.type(ch); await wait(ms) }
}
/** 等列表(含 TS 异步结果)落地:开着且有列表 */
const listed = (r: SuggestRig, ms = 20_000) => until(() => r.listed, ms)
/** 负向断言前的静置:quick suggest 定时器 + 异步 provider 都该已经跑完 */
const quiet = () => wait(200)

const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
const raf = () => new Promise<void>(r => requestAnimationFrame(() => r()))
const raf2 = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
const listEl = () => document.querySelector('.cm-completionList') as HTMLElement

// 注释 / 字符串里不弹要看 token 类型:这几条用真 shiki(typescript + dark-plus)
let realHl: Highlighter
beforeAll(async () => { realHl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) }, 30_000)

beforeAll(async () => {
    // TS 服务冷启动(加载 lib)放这里,后面的用例都走快路径
    const r = mountSuggest({ doc: 'const x = 1\nx', lang: 'typescript', fileName: '/warm.ts' })
    r.trigger()
    await until(() => r.open, 60_000)
    cleanupSuggest()
}, 70_000)

describe('P0-1 提交字符不改坏正常打字', () => {
    // Monaco TS 源不给 commitCharacters:敲 . , : ; ( 都只是插字符,列表关掉/重开
    for (const [doc, input, want] of [
        ['const arr = [1]\n|', 'ar.', 'const arr = [1]\nar.'],
        ['const minimumValue = 1\n|', 'mi,', 'const minimumValue = 1\nmi,'],
        ['const alpha = 1\nconst o = {|}', 'al:', 'const alpha = 1\nconst o = {al:}'],
        ['const minimumValue = 1\n|', 'minimumV;', 'const minimumValue = 1\nminimumV;'],
        ['const minimumValue = 1\n|', 'minimumV(', 'const minimumValue = 1\nminimumV('],
    ] as const) {
        it(`打 ${JSON.stringify(input)} → 文本原样`, async () => {
            const r = mount(doc, { ts: 'p01', options: { autoClosingBrackets: 'never', autoClosingQuotes: 'never' } })
            await typeKeys(r, input)
            expect(r.doc).toBe(want)
        }, 30_000)
    }

    it('与前缀相同的唯一候选也不被吞(旧实现剔除后提交下一项)', async () => {
        const r = mount('const ab = 1, abc = 2\n|')
        await typeKeys(r, 'ab,')
        expect(r.doc).toBe('const ab = 1, abc = 2\nab,')
    })

    it('候选自己声明 commitCharacters 时才提交', async () => {
        const r = mount('|', { providers: [['plaintext', itemsProvider([{ label: 'foobar', commitCharacters: ['('] }])]], options: { autoClosingBrackets: 'never' } })
        r.v.caretCoords = () => ({ left: 10, top: 10, bottom: 30, height: 20 } as never)
        await typeKeys(r, 'fo')
        await until(() => r.listed)
        expect(r.open).toBe(true)
        await raf()
        await typeKeys(r, '(')
        expect(r.doc).toBe('foobar(')
    })
})

describe('P0-2 多实例:每个编辑器各自自动弹补全', () => {
    it('先建的编辑器在后建的之后仍能自动弹', async () => {
        const a = mount('const alphaBeta = 1\n|')
        const b = mount('const gammaDelta = 1\n|')
        await typeKeys(a, 'al')
        await until(() => a.listed)
        expect(a.labels).toContain('alphaBeta')
        // 两个编辑器同时「在场」:b 不抢 DOM 焦点(抢了 a 就按 Monaco 语义失焦关闭),只让它也认自己有焦点
        b.v.hasWidgetFocus = () => true
        for (const ch of 'ga') { b.type(ch); await wait(45) }
        await until(() => b.listed)
        expect(b.labels).toContain('gammaDelta')
        // a 的异步结果不能被 b 的会话吞掉
        expect(a.open).toBe(true)
    })

    it('一个实例销毁后,另一个继续工作', async () => {
        const a = mount('const alphaBeta = 1\n|')
        const b = mount('const gammaDelta = 1\n|')
        b.v.dispose(); b.host.remove()
        await typeKeys(a, 'al')
        await until(() => a.listed)
        expect(a.labels).toContain('alphaBeta')
    })
})

describe('P1-3 过滤与排序 = VS Code fuzzyScore + sortText', () => {
    it('同分按完整 sortText 排(旧实现只看首字符)', async () => {
        const r = mount('|', { providers: [['plaintext', itemsProvider([
            { label: 'aaa', sortText: '15' },
            { label: 'aab', sortText: '11' },
        ])]] })
        await typeKeys(r, 'aa')
        await until(() => r.listed)
        expect(r.labels).toEqual(['aab', 'aaa'])
    })

    it('不截断:300 个候选全部在列表里', async () => {
        const r = mount('|', { providers: [['plaintext', itemsProvider(Array.from({ length: 300 }, (_, i) => ({ label: `item${i}` })))]] })
        await typeKeys(r, 'it')
        await until(() => r.listed)
        expect(r.ui.state.count).toBe(300)
    })

    it('词中命中必须落在词首/驼峰(fuzzyScore 首字符须强匹配)', async () => {
        const r = mount('|', { providers: [['plaintext', itemsProvider([{ label: 'otherfunction' }, { label: 'getFunction' }, { label: 'fun' }])]] })
        await typeKeys(r, 'fun')
        await until(() => r.listed)
        expect(r.labels).toEqual(['fun', 'getFunction'])
    })

    it('完全匹配排第一:doc → doc, document, Document…(Monaco 实测)', async () => {
        const r = mount('const doc = 1\n|', { ts: 'p13-doc' })
        await typeKeys(r, 'doc')
        await listed(r)
        expect(r.labels.slice(0, 6)).toEqual(['doc', 'document', 'Document', 'DocumentFragment', 'DocumentTimeline', 'DocumentType'])
    }, 30_000)

    // Monaco 0.52 前 10 项(内置 TS 5.4.5;本仓 TS 5.7.3,lib 新增类型会插队,只比前几项)
    for (const [prefix, want] of [
        ['con', ['confirm', 'console', 'const', 'continue']],
        ['fo', ['focus', 'for', 'FocusEvent', 'FontFace']],
        ['str', ['string', 'structuredClone', 'String']],
        // Monaco 头一项 ActiveXObject 在 lib.scripthost(VFS 已带上这份 lib)
        ['ax', ['ActiveXObject', 'AudioContext', 'BaseAudioContext']],
    ] as const) {
        it(`${prefix} 前几项与 Monaco 一致`, async () => {
            const r = mount('\n|', { ts: `p13-${prefix}` })
            await typeKeys(r, prefix)
            await listed(r)
            expect(r.labels.slice(0, want.length)).toEqual(want)
        }, 30_000)
    }
})

describe('P1-4 成员位置只给成员', () => {
    it('arr.ma → [map, flatMap],不混关键字/片段/文档词', async () => {
        const r = mount('const arr = [1]\nconst mathMax = 1\n|', { ts: 'p14-arr' })
        await typeKeys(r, 'arr.ma')
        await listed(r)
        expect(r.labels).toEqual(['map', 'flatMap'])
    }, 30_000)

    it('console. → 只有 console 成员', async () => {
        const r = mount('const forEachThing = 1\n|', { ts: 'p14-console' })
        await typeKeys(r, 'console.')
        await listed(r)
        const l = r.labels
        expect(l).toContain('log')
        expect(l).not.toContain('forEachThing')
        expect(l).not.toContain('const')
        const kinds = l.map((_, i) => r.ui.host!.rowAt(i).kind)
        expect(kinds.every(k => k !== 'snippet' && k !== 'text' && k !== 'keyword')).toBe(true)
    }, 30_000)
})

describe('P1-5 注释/字符串/模板串/组字中不自动弹', () => {
    for (const [name, doc] of [
        ['行注释', 'const console2 = 1\n// |'],
        ['块注释', 'const console2 = 1\n/* | */'],
        ['字符串', 'const console2 = 1\nconst s = "|"'],
        ['模板串', 'const console2 = 1\nconst s = `|`'],
    ] as const) {
        it(`${name}里打 co 不弹`, async () => {
            const r = mount(doc, { ts: 'p15', hl: true })
            await typeKeys(r, 'co')
            await quiet()
            expect(r.open).toBe(false)
        }, 30_000)
    }

    it('模板串 ${} 表达式里照常弹', async () => {
        const r = mount('const console2 = 1\nconst s = `${|}`', { ts: 'p15-tpl-expr' })
        await typeKeys(r, 'cons')
        await listed(r)
        expect(r.labels).toContain('console')
    }, 30_000)

    it('对象 key:{ a → 弹 alpha(Monaco 实测)', async () => {
        const r = mount('const alpha = 1\nconst o = { | }', { ts: 'p15-objkey' })
        await typeKeys(r, 'a')
        await listed(r)
        expect(r.labels).toContain('alpha')
    }, 30_000)

    it('IME 组字(compositionType)不触发', async () => {
        const r = mount('const alphaBeta = 1\n|')
        r.v.focus()
        r.v.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        r.v.trigger('keyboard', 'compositionType', { text: 'al' })
        await quiet()
        expect(r.doc.endsWith('al')).toBe(true)
        expect(r.open).toBe(false)
    })

    it('光标在词中间(xa|b)不自动弹', async () => {
        const r = mount('const axb = 1, axe = 2\nx|b')
        await typeKeys(r, 'a')
        // 光标在 x 后,打 a → "xa|b",不在词尾 → 不弹
        await quiet()
        expect(r.open).toBe(false)
    })
})

describe('P1-6 文档词', () => {
    it('不收光标所在的词本身', async () => {
        const r = mount('const minimumValue = 1\n|')
        await typeKeys(r, 'minimumV')
        await until(() => r.listed)
        expect(r.labels).toEqual(['minimumValue'])
        await typeKeys(r, 'alue')
        await quiet()
        // minimumValue 整词打完:文档里另一个 minimumValue 仍在,但光标所在词不再算
        expect(r.labels).toEqual(['minimumValue'])
    })

    it('只有光标所在词时没有候选(旧实现把正在打的词自己列出来)', async () => {
        const r = mount('|')
        await typeKeys(r, 'zzunique')
        await quiet()
        expect(r.open).toBe(false)
    })

    it('TS 有结果时不混入文档词', async () => {
        // 注释里的 consoleWordInComment 是文档词,TS 不认识它
        const r = mount('// consoleWordInComment\n|', { ts: 'p16-mix' })
        await typeKeys(r, 'cons')
        await listed(r)
        const l = r.labels
        expect(l).toContain('console')
        expect(l).not.toContain('consoleWordInComment')
    }, 30_000)

    it('TS 无结果(新标识符位置 const mi)才用文档词兜底', async () => {
        const r = mount('const minimumValue = 1\n|', { ts: 'p16-newid' })
        await typeKeys(r, 'const mi')
        await listed(r)
        expect(r.labels).toEqual(['minimumValue'])
    }, 30_000)
})

describe('P1-7 失焦关闭 / 跟随滚动 / 不越出编辑器', () => {
    it('编辑器失焦 → 列表关闭', async () => {
        const r = mount('const alphaBeta = 1\n|')
        await typeKeys(r, 'al')
        await until(() => r.listed)
        expect(r.open).toBe(true)
        const other = document.createElement('input')
        document.body.appendChild(other)
        other.focus()
        await r.waitClosed()
        expect(r.open).toBe(false)
        other.remove()
    })

    it('光标滚出编辑器可视区 → 列表隐藏,滚回来重新出现', async () => {
        const r = mount('const alphaBeta = 1\n|')
        const v = r.v
        let caret = { left: 100, top: 300, bottom: 320, height: 20 }
        v.caretCoords = () => ({ ...caret } as never)
        v.scrollDOM.getBoundingClientRect = () => rect(0, 200, 800, 400)
        v.dom.getBoundingClientRect = v.scrollDOM.getBoundingClientRect
        await typeKeys(r, 'al')
        await until(() => r.listed)
        const list = listEl()
        await raf()
        expect(list.style.visibility).toBe('visible')
        expect(parseFloat(list.style.top)).toBe(320)
        caret = { left: 100, top: 100, bottom: 120, height: 20 }
        v.scrollDOM.dispatchEvent(new Event('scroll'))
        await raf2()
        expect(list.style.visibility).toBe('hidden')
        caret = { left: 100, top: 260, bottom: 280, height: 20 }
        v.scrollDOM.dispatchEvent(new Event('scroll'))
        await raf2()
        expect(list.style.visibility).toBe('visible')
        expect(parseFloat(list.style.top)).toBe(280)
    })

    it('靠编辑器底 → 翻到上方,列表底不越出编辑器', async () => {
        const words = Array.from({ length: 20 }, (_, i) => `alpha${i}`).join(' ')
        const r = mount(`${words}\n|`)
        const v = r.v
        v.caretCoords = () => ({ left: 100, top: 580, bottom: 600, height: 20 } as never)
        v.dom.getBoundingClientRect = () => rect(0, 200, 800, 410)
        v.scrollDOM.getBoundingClientRect = v.dom.getBoundingClientRect
        Object.defineProperty(window, 'innerHeight', { value: 610, configurable: true })
        await typeKeys(r, 'al')
        await until(() => r.listed)
        await raf()
        const list = listEl()
        const top = parseFloat(list.style.top)
        const h = parseFloat(list.style.height)
        expect(top + h).toBe(578) // 列表底 = caret.top - 2
        expect(top).toBeGreaterThanOrEqual(200)
    })
})

describe('P1-8 片段', () => {
    // 片段由 SnippetController2 展开(Monaco 同):provider 给 InsertAsSnippet 候选
    const snippets = itemsProvider([
        { label: 'for', insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}', kind: 27, insertTextRules: 4 },
        { label: 'if', insertText: 'if (${1:condition}) {\n\t$0\n}', kind: 27, insertTextRules: 4 },
    ])
    const open = async (text: string, options?: Record<string, unknown>) => {
        const r = mount(text, { providers: [['plaintext', snippets]], options })
        r.trigger()
        await until(() => r.listed)
        return r
    }
    const accept = (r: SuggestRig, label: string) => {
        while (r.labels[r.selected] !== label) suggestNext(r.v)
        expect(r.ui.command!('accept')).toBe(true)
    }
    const selText = (r: SuggestRig) => { const s = r.v.getSelection()!; return r.v.getModel()!.getValueInRange(s) }
    const inSnippet = (r: SuggestRig) => !!getContextKeyService(r.v).getContextKeyValue<boolean>('inSnippetMode')
    const tab = (r: SuggestRig) => r.ui.command!('tab')

    it('for:Tab 依次 $1 → $2 → $0(同号只停一次)', async () => {
        const r = await open('for|')
        accept(r, 'for')
        expect(r.doc).toBe('for (let i = 0; i < n; i++) {\n    \n}')
        expect(selText(r)).toBe('i')
        expect(r.v.state.selection.main.from).toBe(9)
        expect(tab(r)).toBe(true)
        expect(selText(r)).toBe('n')
        expect(tab(r)).toBe(true)
        // $0:块内空行的缩进之后,片段模式结束
        expect(r.v.state.selection.main.head).toBe(r.doc.indexOf('{\n') + 2 + 4)
        expect(inSnippet(r)).toBe(false)
    })

    it('$1 同号联动:改第一个 i,三处一起变', async () => {
        const r = await open('for|')
        accept(r, 'for')
        r.type('k')
        expect(r.doc).toBe('for (let k = 0; k < n; k++) {\n    \n}')
    })

    it('缩进块里展开:后续行带上当前行缩进,\\t 换成缩进单元', async () => {
        const r = await open('function f() {\n  if|\n}', { tabSize: 2, insertSpaces: true })
        accept(r, 'if')
        expect(r.doc).toBe('function f() {\n  if (condition) {\n    \n  }\n}')
        expect(selText(r)).toBe('condition')
        tab(r)
        expect(r.v.state.selection.main.head).toBe(r.doc.indexOf('{\n    ', 16) + 2 + 4)
    })
})

describe('P2-9 外观与导航', () => {
    const many = itemsProvider(Array.from({ length: 40 }, (_, i) => ({
        label: `w${String(i).padStart(2, '0')}x`, detail: `detail ${i}`, kind: i % 2 ? 1 : 9,
    })))
    const openMany = async () => {
        const r = mount('|', { providers: [['plaintext', many]] })
        r.v.caretCoords = () => ({ left: 10, top: 10, bottom: 30, height: 20 } as never)
        await typeKeys(r, 'w')
        await until(() => r.listed)
        return r
    }

    it('行高 = 编辑器行高;宽 430;detail 只在聚焦行', async () => {
        const r = await openMany()
        const list = listEl()
        const rows = [...list.querySelectorAll<HTMLElement>('.cm-completionItem')]
        const lh = Math.round(r.v.oracle.lineHeight)
        expect(rows[0].style.height).toBe(`${lh}px`)
        expect(list.style.width).toBe('430px')
        expect(rows.filter(x => x.querySelector('.cm-completionDetail')).length).toBe(1)
        expect(rows[0].querySelector('.cm-completionDetail')?.textContent).toBe('detail 0')
    })

    it('虚拟渲染:40 项只画视口附近的行,但 aria-setsize = 40', async () => {
        await openMany()
        const rows = [...document.querySelectorAll<HTMLElement>('.cm-completionList .cm-completionItem')]
        expect(rows.length).toBeLessThan(40)
        expect(rows[0].getAttribute('aria-setsize')).toBe('40')
    })

    it('kind → codicon(Monaco CompletionItemKinds)', async () => {
        await openMany()
        const icons = [...document.querySelectorAll<HTMLElement>('.cm-completionList .cm-completionIcon')]
        expect(icons[0].classList.contains('codicon-symbol-property')).toBe(true)
        expect(icons[1].classList.contains('codicon-symbol-function')).toBe(true)
    })

    it('列表开着再按触发键 → 切换右侧详情面板(detail 移进面板)', async () => {
        const r = await openMany()
        expect(document.querySelector('.cm-completionDetails')).toBeNull()
        r.ui.command!('trigger')
        await until(() => !!document.querySelector('.cm-completionDetails'), 1000)
        const panel = document.querySelector('.cm-completionDetails') as HTMLElement
        expect(panel).not.toBeNull()
        expect(panel.textContent).toContain('detail 0')
        expect(document.querySelector('.cm-completionList .cm-completionDetail')).toBeNull()
        r.ui.command!('trigger')
        await until(() => !document.querySelector('.cm-completionDetails'), 1000)
        expect(document.querySelector('.cm-completionDetails')).toBeNull()
    })

    it('方向键环绕;PageDown 到尾停住', async () => {
        const r = await openMany()
        suggestPrev(r.v)
        expect(r.selected).toBe(39)
        suggestNext(r.v)
        expect(r.selected).toBe(0)
        for (let i = 0; i < 10; i++) suggestPageNext(r.v)
        expect(r.selected).toBe(39)
    })

    it('a 后 PageDown ×3(Monaco 实测 focused=35)', async () => {
        const r = await openMany()
        for (let i = 0; i < 3; i++) suggestPageNext(r.v)
        expect(r.selected).toBe(35)
    })
})

describe('provider 分组组合(源分组)', () => {
    // 旧 gatherAsync:语言源有结果时文档词不参与,返回空时文档词兜底。新路径 = 注册表分组语义('*' 最低组)
    const lang: CompletionItemProvider = {
        provideCompletionItems(model, position) {
            if (!model.getValue().startsWith('fromWord')) return null
            const w = model.getWordUntilPosition(position)
            const range = { startLineNumber: position.lineNumber, startColumn: w.startColumn, endLineNumber: position.lineNumber, endColumn: position.column }
            return { suggestions: [{ label: 'fromLang', kind: 4, insertText: 'fromLang', sortText: '11', range }] }
        },
    }
    it('语言源返回空时,文档词兜底;语言源有结果时,文档词不参与', async () => {
        const a = mount('fromWord\nfr|', { providers: [['plaintext', lang]] })
        a.trigger()
        await until(() => a.listed)
        expect(a.labels).toEqual(['fromLang'])
        const b = mount('fromW f|', { providers: [['plaintext', lang]] })
        b.trigger()
        await until(() => b.listed)
        expect(b.labels).toEqual(['fromW'])
    })
})

describe('P1-3 增量重过滤(Monaco Refilter.Incr)', () => {
    it('同分项保持上一步的顺序:st → str 时 statusbar 仍在 StylePropertyMap 前(Monaco 实测)', async () => {
        // 两者打 str 同分 0;打 st 时 statusbar 分高(小写 s 精确命中)。源顺序按 label 是 StylePropertyMap 在前。
        const r = mount('|', { providers: [['plaintext', itemsProvider([
            { label: 'StylePropertyMap', sortText: '15' },
            { label: 'statusbar', sortText: '15' },
        ])]] })
        await typeKeys(r, 'st')
        await until(() => r.listed)
        expect(r.labels).toEqual(['statusbar', 'StylePropertyMap'])
        await typeKeys(r, 'r')
        expect(r.labels).toEqual(['statusbar', 'StylePropertyMap'])
        // 退格 → Refilter.All:回到源顺序 + 分数
        r.v.trigger('keyboard', 'deleteLeft', {})
        await wait(60)
        await typeKeys(r, 'r')
        await until(() => r.listed)
        expect(r.labels).toEqual(['statusbar', 'StylePropertyMap'])
    })
})

describe('P1-4 成员位置不出需要改写 . 的候选', () => {
    it('Math. 里没有 Symbol([Symbol] 要替换掉 .,接受后会变成 Math.[Symbol])', async () => {
        const r = mount('|', { ts: 'p14-math' })
        await typeKeys(r, 'Math.')
        await listed(r)
        const l = r.labels
        expect(l.slice(0, 10)).toEqual(['E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2', 'abs', 'acos'])
        expect(l).not.toContain('Symbol')
    }, 30_000)

    it('可选属性 obj. 不出 ?.x 形式的插入文本', async () => {
        const doc = 'declare const o: { a?: { b: number } }\no.a.'
        const items = await provideTs(doc, { lang: 'typescript', fileName: tsFile('p14-optchain') }, { triggerKind: 1 })
        expect(items).not.toBeNull()
        expect(items!.length).toBeGreaterThan(0)
        expect(items!.every(o => !(typeof o.insertText === 'string' ? o.insertText : '').startsWith('?.'))).toBe(true)
    }, 30_000)
})

describe('R3 非 ASCII 标识符(组字提交后)', () => {
    // Monaco:组字结束 → _doTriggerQuickSuggest,注释/字符串按 token 类型不弹;代码里 TS 给全量 entries,
    // 过滤后没有就不弹,文档词(word-based 组)不兜底。旧实现见 CJK 字符就让 TS 源返 null → 文档词兜底弹出。
    const commit = async (r: SuggestRig, text: string) => {
        r.v.focus()
        r.v.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        r.v.trigger('keyboard', 'compositionType', { text })
        r.v.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { data: text, bubbles: true }))
        await wait(120)
        await quiet()
    }
    for (const [name, doc] of [
        ['注释', '// 你好吗\n// |'],
        ['字符串', 'const s = "你们"\nconst t = "|"'],
        ['代码空行', '你好吗\n|'],
    ] as const) {
        it(`${name}里提交「你好」不弹文档词`, async () => {
            const r = mount(doc, { ts: 'r3-cjk' })
            await commit(r, '你好')
            expect(r.labels).toEqual([])
        }, 30_000)
    }
    it('显式触发时 CJK 前缀照常拿 TS 候选', async () => {
        const r = mount('const 你好吗 = 1\n你|', { ts: 'r3-cjk' })
        r.trigger()
        await listed(r)
        expect(r.labels).toContain('你好吗')
    }, 30_000)
})
