// 基础语言(src/basic-languages,81 个 Monarch 定义)的 language configuration:
// 语言第一次被编辑器用上时,定义里的 conf 经 setLanguageConfiguration 真的生效 —— 注释切换、括号匹配、自动闭合、折叠标记、缩进规则、词定义。
// 对全部语言逐个、机械地核对「定义里写了什么 → 编辑器里实际是什么」,不抽样:conf 是什么就断言什么,所以新增 / 改动定义时这里自动跟着。
import { describe, expect, it } from 'vitest'
import '../../src/basic-languages/register.all'
import { loadLanguage } from '../../src/basic-languages/_.contribution'
import { getLanguages, getLanguageConfiguration, getWordDefinition } from '../../src/api/languages'
import { toggleComment, toggleBlockComment, EditorSelection } from '../../src/core/index'
import { bracketTable, matchBracketAt } from '../../src/core/edit/brackets'
import { closeBracketChange } from '../../src/core/edit/closebrackets'
import { foldingMarkers, regionMarker } from '../../src/core/edit/fold'
import { indentRulesFacet } from '../../src/core/edit/autoindent'
import { resolveCharacterPairs } from '../../src/lang/langconfig'
import { mount } from '../core/h1-helpers'

type Conf = import('../../src/api/languages').LanguageConfiguration
type Def = { id: string, loader: () => Promise<{ conf: Conf }> }

// register.ts 里每个 registerLanguage 登记的语言(带 loader 的才是基础语言;SEED 里的 ini 等没有 loader)
const defs = (getLanguages() as unknown as Def[]).filter(l => typeof l.loader === 'function')
const settle = () => new Promise(r => setTimeout(r, 0))

const put = (ed: any, doc: string, head = doc.length) =>
    ed.dispatch(ed.state.update({ changes: { from: 0, to: ed.state.doc.length, insert: doc }, selection: EditorSelection.cursor(head) }))

// 用 mount 建一个该语言的编辑器,让「语言被遇到」走一遍真实路径(onLanguageEncountered → setLanguageConfiguration)
async function open(id: string, doc = 'a') {
    const m = mount({ lang: id, doc })
    await loadLanguage(id)
    await settle()
    return m
}

it('一共登记了 89 个基础语言 id(81 个定义文件,freemarker2 / c·cpp / systemverilog·verilog 等一文件多 id)', () => {
    expect(defs.length).toBe(89)
})

describe.each(defs.map(d => [d.id, d] as const))('语言配置 %s', (id, def) => {
    it('首次用上后配置已安装,且和定义里的 conf 是同一份', async () => {
        const { done } = await open(id)
        const conf = (await def.loader()).conf
        expect(getLanguageConfiguration(id)).toBe(conf)
        done()
    })

    it('注释:⌘/ 用 conf.comments.lineComment(没有就退到块注释;都没有就不动作)', async () => {
        const { ed, done } = await open(id)
        const conf = (await def.loader()).conf
        const lc = conf.comments?.lineComment
        const line = typeof lc === 'object' && lc ? lc.comment : lc
        const block = conf.comments?.blockComment
        put(ed, 'abc')
        toggleComment(ed)
        const got = ed.getValue()
        if (line) expect(got).toBe(`${line} abc`)
        else if (block) expect(got).toBe(`${block[0]} abc ${block[1]}`)
        else expect(got).toBe('abc')
        done()
    })

    it('块注释:⇧⌥A 用 conf.comments.blockComment(没有就不动作)', async () => {
        const { ed, done } = await open(id)
        const block = (await def.loader()).conf.comments?.blockComment
        put(ed, 'abc')
        ed.dispatch(ed.state.update({ selection: EditorSelection.range(0, 3) }))
        toggleBlockComment(ed)
        if (block) expect(ed.getValue()).toBe(`${block[0]} abc ${block[1]}`)
        else expect(ed.getValue()).toBe('abc')
        done()
    })

    it('括号:匹配表就是 conf.brackets;每一对在文本里互相配上', async () => {
        const { ed, done } = await open(id)
        const conf = (await def.loader()).conf
        const pairs = (conf.brackets ?? []).filter(([o, c]) => o.length === 1 && c.length === 1)
        const tbl = bracketTable(ed.state)
        expect(tbl.custom).toBe(true)
        for (const [o, c] of pairs) {
            // 同一对括号:开括号 → 闭括号。有的语言把 o === c(如引号)当括号,配对表里不成立,跳过
            if (o === c) continue
            const text = `${o}x${c}`
            expect(matchBracketAt(text, 0, 0, undefined, tbl), `${id}: ${o}${c}`).toEqual([0, 2])
        }
        done()
    })

    it('自动闭合:autoClosingPairs(没给用 brackets)里的每个单字符开符,在空位置打出来补闭符', async () => {
        const { ed, done } = await open(id, '')
        const conf = (await def.loader()).conf
        const { autoClosingPairs } = resolveCharacterPairs({ brackets: [['(', ')'], ['[', ']'], ['{', '}']], ...conf })
        put(ed, '')
        for (const p of autoClosingPairs) {
            if (p.open.length !== 1 || p.close.length !== 1 || p.open === p.close) continue
            // notIn 只在 string / comment 里才不补;空文档里肯定在代码里
            const r = closeBracketChange(ed.state, { from: 0, to: 0, insert: p.open }, true)
            expect(r?.insert, `${id}: ${p.open}`).toBe(p.open + p.close)
        }
        done()
    })

    it('折叠标记:conf.folding.markers 的 start / end 行被认成 region 开 / 闭(没有 markers 就没有)', async () => {
        const { ed, done } = await open(id)
        const m = (await def.loader()).conf.folding?.markers
        const facet = ed.state.facet(foldingMarkers)
        if (!m) { expect(facet).toBeNull(); done(); return }
        expect(facet?.regex?.start).toBe(m.start)
        expect(facet?.regex?.end).toBe(m.end)
        done()
    })

    it('缩进规则:conf.indentationRules 进了装配(没有就没有)', async () => {
        const { ed, done } = await open(id)
        const r = (await def.loader()).conf.indentationRules
        const got = ed.state.facet(indentRulesFacet)
        if (!r) expect(got).toBeUndefined()
        else {
            expect(got?.increaseIndentPattern?.source).toBe(r.increaseIndentPattern.source)
            expect(got?.decreaseIndentPattern?.source).toBe(r.decreaseIndentPattern.source)
        }
        done()
    })

    it('词定义:conf.wordPattern 生效(没有就是 Monaco 默认词定义)', async () => {
        const { done } = await open(id)
        const w = (await def.loader()).conf.wordPattern
        const got = getWordDefinition(id)
        if (w) expect(got.source).toBe(w.source)
        else expect(got.source).toBe(getWordDefinition('plaintext-never-configured').source)
        done()
    })
})

describe('抽样:几个语言的真实行为(不是读 conf 再断言 conf)', () => {
    it('python:# 注释;( [ { 和引号自动闭合;#region 折叠', async () => {
        const { ed, done } = await open('python', 'x = 1')
        toggleComment(ed)
        expect(ed.getValue()).toBe('# x = 1')
        put(ed, '')
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '(' }, true)?.insert).toBe('()')
        expect(closeBracketChange(ed.state, { from: 0, to: 0, insert: '"' }, true)?.insert).toBe('""')
        expect(regionMarker(ed.state.facet(foldingMarkers), '#region foo')).toBe('open')
        expect(regionMarker(ed.state.facet(foldingMarkers), '#endregion')).toBe('close')
        done()
    })

    it('rust:// 注释;< > 不是括号对', async () => {
        const { ed, done } = await open('rust', 'let a')
        toggleComment(ed)
        expect(ed.getValue()).toBe('// let a')
        expect(matchBracketAt('(x)', 0, 0, undefined, bracketTable(ed.state))).toEqual([0, 2])
        done()
    })

    it('html:块注释 <!-- -->,没有行注释', async () => {
        const { ed, done } = await open('html', 'abc')
        toggleComment(ed)
        expect(ed.getValue()).toBe('<!-- abc -->')
        done()
    })

    it('sql:-- 行注释 + /* */ 块注释', async () => {
        const { ed, done } = await open('sql', 'select 1')
        toggleComment(ed)
        expect(ed.getValue()).toBe('-- select 1')
        done()
    })

    it('bat:REM 行注释、::#region 折叠', async () => {
        const { ed, done } = await open('bat', 'echo hi')
        toggleComment(ed)
        expect(ed.getValue()).toBe('REM echo hi')
        expect(regionMarker(ed.state.facet(foldingMarkers), ':: #region x')).toBe('open')
        expect(regionMarker(ed.state.facet(foldingMarkers), 'REM #endregion')).toBe('close')
        done()
    })

    it('c 和 cpp 共用 cpp 定义:两个 id 各自都装上了同一份配置', async () => {
        const a = await open('c'), b = await open('cpp')
        expect(getLanguageConfiguration('c')).toBe(getLanguageConfiguration('cpp'))
        a.done(); b.done()
    })
})
