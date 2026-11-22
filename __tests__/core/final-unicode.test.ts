// unicodeHighlight.includeComments / includeStrings 的行为:注释 / 字符串里的易混、不可见字符是否画框
// (Monaco unicodeHighlight 的 hideInCommentTokens / hideInStringTokens)。token 类型取自真 shiki(typescript + dark-plus)的 token 缓存。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { EditorState } from '../../src/core/model/state'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { selectTokenCache, ensureTokenCache } from '../../src/core/view/tokens'
import { unicodeHighlightRanges } from '../../src/core/feature/specialchar'

const OPTS = { lang: 'typescript', theme: 'dark-plus' }
let hl: Highlighter
beforeAll(async () => { hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) })

const CYR = '\u0430' // 西里尔 а,易混
const ZWSP = '\u200B' // 零宽空格,不可见
// 四处:代码 / 行注释 / 字符串 / 块注释 / 模板串
const DOC = [
    `let c${CYR} = 1`, // 0 代码
    `// com${CYR}ment`, // 1 行注释
    `const s = "str${CYR}ing"`, // 2 字符串
    `/* blk${ZWSP}ck */`, // 3 块注释
    `const t = \`tpl${CYR}\``, // 4 模板串
].join('\n')

/** 每个框所在的行号(1 起) */
function boxLines(options: IEditorOptions): number[] {
    const state = EditorState.create({ doc: DOC, extensions: [editorOptions.of(options)] })
    const owner = { viewport: { from: 0, to: DOC.length } }
    selectTokenCache(owner)
    ensureTokenCache(hl as never, DOC.split('\n'), OPTS)
    return unicodeHighlightRanges(state, owner).map(r => state.doc.lineAt(r.from).number)
}

describe('unicodeHighlight.includeComments / includeStrings(有 token 缓存时)', () => {
    it('默认:注释里不画框,字符串(含模板串)里画,代码里画', () => {
        expect(boxLines({})).toEqual([1, 3, 5])
    })

    it('includeComments:true → 行注释、块注释里也画框', () => {
        expect(boxLines({ unicodeHighlight: { includeComments: true, includeStrings: true } })).toEqual([1, 2, 3, 4, 5])
    })

    it('includeStrings:false → 字符串和模板串里不画框(注释仍不画)', () => {
        expect(boxLines({ unicodeHighlight: { includeStrings: false } })).toEqual([1])
    })

    it('includeComments:true + includeStrings:false → 只有注释和代码画', () => {
        expect(boxLines({ unicodeHighlight: { includeComments: true, includeStrings: false } })).toEqual([1, 2, 4])
    })

    it('注释里的不可见字符同理(块注释行 4 的零宽空格只在 includeComments 时框)', () => {
        const without = boxLines({})
        const withC = boxLines({ unicodeHighlight: { includeComments: true, includeStrings: true } })
        expect(without.includes(4)).toBe(false)
        expect(withC.includes(4)).toBe(true)
    })

    it('只给 includeComments 不给 includeStrings:另一个落到 inUntrustedWorkspace(受信任环境 = false),与 Monaco validate 一致', async () => {
        // Monaco UnicodeHighlight.validate:缺的 include* 取 inUntrustedWorkspace,不是 defaultValue。updateOptions 的深合并路径会带上已有值,所以只有整块新给时才这样
        // (editorOptions.js 1975-1982:primitiveSet(input.includeStrings, inUntrustedWorkspace, …))
        expect(boxLines({ unicodeHighlight: { includeComments: true } })).toEqual([1, 2, 4])
    })

    it('没有 token 缓存时(纯文本)不能区分注释 / 字符串,一律按画框处理', () => {
        const state = EditorState.create({ doc: DOC })
        expect(unicodeHighlightRanges(state)).toHaveLength(5)
    })
})
