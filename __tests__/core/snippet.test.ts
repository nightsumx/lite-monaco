import { afterEach, describe, expect, it } from 'vitest'
import { expandSnippet } from '../../src/core/feature/snippet'
import { runSuggestCommand, suggestTab, suggestShiftTab } from '../../src/core/feature/suggestwidget'
import { getContextKeyService } from '../../src/api/contextkeys'
import { createTSService, clearTSServiceCache } from '../../src/lang/tsservice'
import { codeActionsToChanges } from '../../src/lang/tscompletion'
import { mountSuggest, cleanupSuggest, fixedProvider, provideTs, until, wait, type SuggestRig } from './_suggest-harness'

describe('expandSnippet', () => {
    it('$0 落末尾', () => {
        const e = expandSnippet('hello$0')
        expect(e.text).toBe('hello')
        expect(e.stops.some(s => s.order === 0 && s.pos === 5)).toBe(true)
    })

    it('${1} 无默认值占空位', () => {
        const e = expandSnippet('fn(${1})$0')
        expect(e.text).toBe('fn()')
        const s1 = e.stops.find(s => s.order === 1)!
        expect(s1.len).toBe(0)
        expect(s1.pos).toBe(3)
    })

    it('${1:default} 展开默认值', () => {
        const e = expandSnippet('for (let ${1:i} = 0; $0)')
        expect(e.text).toBe('for (let i = 0; )')
        const s1 = e.stops.find(s => s.order === 1)!
        expect(s1.len).toBe(1)
        expect(e.text.slice(s1.pos, s1.pos + s1.len)).toBe('i')
    })

    it('两个 stop 再 $0', () => {
        const e = expandSnippet('fn(${1:a}, ${2:b})$0')
        expect(e.text).toBe('fn(a, b)')
        expect(e.stops.filter(s => s.order === 1).length).toBe(1)
        expect(e.stops.filter(s => s.order === 2).length).toBe(1)
        expect(e.stops.some(s => s.order === 0 && s.pos === e.text.length)).toBe(true)
    })

    it('同号 stop 各占一处，按 pos 排', () => {
        const e = expandSnippet('${1:x} and ${1:x}$0')
        expect(e.text).toBe('x and x')
        const ones = e.stops.filter(s => s.order === 1)
        expect(ones.length).toBe(2)
        expect(ones[0].pos).toBe(0)
        expect(ones[1].pos).toBe(6)
        expect(ones[0].len).toBe(1)
        expect(ones[1].len).toBe(1)
        expect(e.stops.filter(s => s.order === 0)).toHaveLength(1)
    })

    it('转义 \\$', () => {
        const e = expandSnippet('price \\$5$0')
        expect(e.text).toBe('price $5')
    })

    it('未闭合 ${ 当字面量', () => {
        const e = expandSnippet('a${')
        expect(e.text).toBe('a${')
    })

    it('单独 $ 当字面量', () => {
        const e = expandSnippet('price $')
        expect(e.text).toBe('price $')
    })

    it('嵌套 ${1:${2:x}} 解析内层：两处 stop，文本是 x', () => {
        const e = expandSnippet('${1:${2:x}}$0')
        expect(e.text).toBe('x')
        const s1 = e.stops.find(s => s.order === 1)!
        const s2 = e.stops.find(s => s.order === 2)!
        expect(s1.pos).toBe(0)
        expect(s1.len).toBe(1)
        expect(s2.pos).toBe(0)
        expect(s2.len).toBe(1)
        expect(e.text.slice(s1.pos, s1.pos + s1.len)).toBe('x')
    })

    it('${1:foo ${2:bar}} 外层包住内层', () => {
        const e = expandSnippet('${1:foo ${2:bar}}$0')
        expect(e.text).toBe('foo bar')
        const s1 = e.stops.find(s => s.order === 1)!
        const s2 = e.stops.find(s => s.order === 2)!
        expect(e.text.slice(s1.pos, s1.pos + s1.len)).toBe('foo bar')
        expect(e.text.slice(s2.pos, s2.pos + s2.len)).toBe('bar')
    })

    it('${1|one,two|} 取第一项', () => {
        const e = expandSnippet('${1|one,two|}$0')
        expect(e.text).toBe('one')
        const s1 = e.stops.find(s => s.order === 1)!
        expect(e.text.slice(s1.pos, s1.pos + s1.len)).toBe('one')
    })
})

// 片段会话 = Monaco SnippetController2(src/api/snippetcontroller.ts),经「补全接受」真实路径进入;
// Tab / Shift-Tab = SuggestUi 的 tab / shiftTab 命令(键位绑定同路径)。
const sel = (r: SuggestRig) => r.v.getSelections()!.map(s => r.v.getModel()!.getValueInRange(s))
const inSnippet = (r: SuggestRig) => !!getContextKeyService(r.v).getContextKeyValue<boolean>('inSnippetMode')
const snippetLabel = (label: string, insertText: string) => fixedProvider([label], { kind: 28, insertText, insertTextRules: 4 })
/** 打开补全并接受焦点项(label 项即片段) */
async function acceptSnippet(doc: string, insertText: string, label = 'x'): Promise<SuggestRig> {
    const r = mountSuggest({ doc, providers: [['plaintext', snippetLabel(label, insertText)]] })
    r.trigger()
    await r.waitOpen()
    await until(() => r.listed)
    expect(runSuggestCommand(r.v, 'accept')).toBe(true)
    return r
}

describe('snippet accept + Tab', () => {
    afterEach(() => cleanupSuggest())

    it('接受片段后 stops 可 Tab 跳', async () => {
        const r = await acceptSnippet('for', 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}', 'for')
        expect(r.doc).toContain('for (let i = 0')
        expect(inSnippet(r)).toBe(true)
        expect(sel(r)).toEqual(['i', 'i', 'i']) // $1 三处同号:多选区
        expect(suggestTab(r.v)).toBe(true)
        expect(sel(r)).toEqual(['n'])
    })

    it('Tab 过最后一个 stop:清 session 返 false', async () => {
        const r = await acceptSnippet('x', '${1:a}$0')
        expect(sel(r)).toEqual(['a'])
        expect(suggestTab(r.v)).toBe(true)
        const s = r.v.getSelection()!
        expect(s.startLineNumber === s.endLineNumber && s.startColumn === s.endColumn).toBe(true)
        expect(r.v.getPosition()!.column).toBe(2)
        expect(inSnippet(r)).toBe(false)
        expect(suggestTab(r.v)).toBe(false)
    })

    it('Shift-Tab 回上一处;$1 上再退返 false', async () => {
        const r = await acceptSnippet('x', '${1:a}${2:b}$0')
        expect(sel(r)).toEqual(['a'])
        expect(suggestShiftTab(r.v)).toBe(false)
        expect(sel(r)).toEqual(['a'])
        expect(suggestTab(r.v)).toBe(true)
        expect(sel(r)).toEqual(['b'])
        expect(suggestShiftTab(r.v)).toBe(true)
        expect(sel(r)).toEqual(['a'])
        expect(getContextKeyService(r.v).getContextKeyValue<boolean>('hasPrevTabstop')).toBe(false)
    })

    it('同号 $1 改一处其余跟着变', async () => {
        const r = await acceptSnippet('x', '${1:i} + ${1:i}$0')
        expect(r.doc).toBe('i + i')
        expect(sel(r)).toEqual(['i', 'i'])
        r.type('k')
        expect(r.doc).toBe('k + k')
        expect(sel(r)).toEqual(['', '']) // 打字后两处各是一个光标(选区被替换掉)
    })

    it('单号 stop 改字只动这一处,占位跟着长', async () => {
        const r = await acceptSnippet('x', '${1:a}${2:b}$0')
        // 光标落到 $1 末尾再追加:占位范围随输入变长,$2 不受影响
        r.v.setPosition({ lineNumber: 1, column: 2 })
        r.type('c')
        expect(r.doc).toBe('acb')
        expect(inSnippet(r)).toBe(true)
        expect(suggestTab(r.v)).toBe(true)
        expect(sel(r)).toEqual(['b'])
        expect(suggestShiftTab(r.v)).toBe(true)
        expect(sel(r)).toEqual(['ac'])
    })
})

describe('snippetDecorations', () => {
    afterEach(() => cleanupSuggest())
    it('占位符带 snippet-placeholder 装饰(同号两处都有),$0 不带;会话结束装饰消失', async () => {
        const r = await acceptSnippet('x', '${1:i} + ${1:i}$0')
        await wait(20)
        const marks = () => [...r.v.dom.querySelectorAll('.snippet-placeholder')].map(n => n.textContent)
        expect(marks()).toEqual(['i', 'i'])
        expect(suggestTab(r.v)).toBe(true)
        expect(inSnippet(r)).toBe(false)
        await wait(20)
        expect(marks()).toEqual([])
    })
})

describe('snippetLinkInput', () => {
    afterEach(() => cleanupSuggest())
    it('真实输入路径认领同号改写', async () => {
        const r = await acceptSnippet('x', '${1:i}+${1:i}$0')
        expect(r.doc).toBe('i+i')
        r.type('k')
        expect(r.doc).toBe('k+k')
    })
})

describe('codeActionsToChanges', () => {
    it('提取本文件 textChanges 并倒序', () => {
        const ch = codeActionsToChanges([{
            changes: [{
                fileName: '/main.ts',
                textChanges: [
                    { span: { start: 0, length: 0 }, newText: "import { x } from './m'\n" },
                    { span: { start: 10, length: 2 }, newText: 'xx' },
                ],
            }],
        }], '/main.ts')
        expect(ch.length).toBe(2)
        expect(ch[0].from).toBeGreaterThanOrEqual(ch[1].from)
    })
})

describe('多文件 VFS', () => {
    it('跨文件:本地模块符号可补全', async () => {
        clearTSServiceCache()
        const session = createTSService({
            lang: 'typescript',
            fileName: '/main.ts',
            files: {
                '/utils.ts': 'export function greet(name: string): string { return name }\n',
            },
        })
        await session.ensure()
        const doc = "import { gre } from './utils'\ngre"
        session.update(doc)
        const info = await session.service().getCompletionsAtPosition('/main.ts', doc.length, {
            includeCompletionsForModuleExports: true,
        })
        const names = (info?.entries ?? []).map(e => e.name)
        expect(names.some(n => n === 'greet')).toBe(true)
    }, 60_000)

    it('tsCompletionProvider + tsFiles', async () => {
        clearTSServiceCache()
        // 光标在 import 花括号内,补全导出符号
        const doc = "import { ad } from './math'"
        const pos = "import { ad".length
        const list = await provideTs(doc, {
            lang: 'typescript',
            fileName: '/app.ts',
            files: {
                '/math.ts': 'export function add(a: number, b: number) { return a + b }\n',
            },
        }, { pos })
        expect(list?.some(c => (typeof c.label === 'string' ? c.label : c.label.label) === 'add')).toBe(true)
    }, 60_000)
})
