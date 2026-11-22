// K1:quickSuggestions 分档用的 token 类型,取自真 shiki(typescript + dark-plus)的 token 缓存(和括号 / 缩进同一份)。
import { beforeAll, describe, expect, it } from 'vitest'
import { createHighlighter, type Highlighter } from 'shiki'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions, getOption } from '../../src/core/options'
import { selectTokenCache, ensureTokenCache } from '../../src/core/view/tokens'
import { StandardTokenType, tokenTypeBefore, normalizeQuickSuggestions, quickSuggestionFor } from '../../src/core/feature/tokentype'

// 自动触发的 token 档判定(SuggestModel 用的同一组原语):全关 → 否;全开 → 是;否则按光标前 token 类型取档位
function quickSuggestAllowed(owner: object, state: EditorState, pos: number): boolean {
    const q = normalizeQuickSuggestions(getOption(state, 'quickSuggestions'))
    if (q.other === 'off' && q.comments === 'off' && q.strings === 'off') return false
    if (q.other === 'on' && q.comments === 'on' && q.strings === 'on') return true
    return quickSuggestionFor(q, tokenTypeBefore(owner, state, pos)) === 'on'
}

const OPTS = { lang: 'typescript', theme: 'dark-plus' }
let hl: Highlighter
beforeAll(async () => { hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] }) })

const DOC = '// line comment\nconst s = "a string"\n/* block\n   comment */ const r = /re+/g\nconst t = `x ${foo} y`\nlet code = 1'

function target(options: Record<string, unknown> = {}) {
    const state = EditorState.create({ doc: DOC, selection: EditorSelection.single(0), extensions: [editorOptions.of(options as never)] })
    const owner = {}
    selectTokenCache(owner)
    ensureTokenCache(hl as never, DOC.split('\n'), OPTS)
    return { owner, state }
}
const posAfter = (needle: string, nth = 0) => {
    let i = -1
    for (let k = 0; k <= nth; k++) i = DOC.indexOf(needle, i + 1)
    return i + needle.length
}

describe('tokenTypeBefore', () => {
    it('注释 / 字符串 / 正则 / 代码', () => {
        const { owner, state } = target()
        expect(tokenTypeBefore(owner, state, posAfter('// line'))).toBe(StandardTokenType.Comment)
        expect(tokenTypeBefore(owner, state, posAfter('a str'))).toBe(StandardTokenType.String)
        expect(tokenTypeBefore(owner, state, posAfter('comment'))).toBe(StandardTokenType.Comment)
        // TS 文法里正则是 string.regexp:vscode-textmate 的规则取第一个命中词 string → String(和 Monaco 一致)
        expect(tokenTypeBefore(owner, state, posAfter('/re'))).toBe(StandardTokenType.String)
        expect(tokenTypeBefore(owner, state, posAfter('let co'))).toBe(StandardTokenType.Other)
    })
    it('模板串里:字符串部分是 String,${} 表达式里是代码', () => {
        const { owner, state } = target()
        expect(tokenTypeBefore(owner, state, posAfter('`x'))).toBe(StandardTokenType.String)
        expect(tokenTypeBefore(owner, state, posAfter('${fo'))).toBe(StandardTokenType.Other)
    })
    it('没有 token 缓存 → Other(不发明信息)', () => {
        const state = EditorState.create({ doc: DOC })
        expect(tokenTypeBefore({}, state, posAfter('// line'))).toBe(StandardTokenType.Other)
    })
})

describe('quickSuggestions 对真 token 分档', () => {
    it('默认:代码里允许,注释 / 字符串里不允许', () => {
        const { owner, state } = target()
        expect(quickSuggestAllowed(owner, state, posAfter('let co'))).toBe(true)
        expect(quickSuggestAllowed(owner, state, posAfter('// line'))).toBe(false)
        expect(quickSuggestAllowed(owner, state, posAfter('a str'))).toBe(false)
    })
    it('comments:on / strings:on 各自放开', () => {
        const a = target({ quickSuggestions: { comments: 'on' } })
        expect(quickSuggestAllowed(a.owner, a.state, posAfter('// line'))).toBe(true)
        expect(quickSuggestAllowed(a.owner, a.state, posAfter('a str'))).toBe(false)
        const b = target({ quickSuggestions: { strings: 'on' } })
        expect(quickSuggestAllowed(b.owner, b.state, posAfter('a str'))).toBe(true)
    })
    it('other:off 代码里不弹', () => {
        const { owner, state } = target({ quickSuggestions: { other: 'off' } })
        expect(quickSuggestAllowed(owner, state, posAfter('let co'))).toBe(false)
    })
    it('normalize:boolean 三档同值,对象缺的档取默认', () => {
        expect(normalizeQuickSuggestions(false)).toEqual({ other: 'off', comments: 'off', strings: 'off' })
        expect(normalizeQuickSuggestions(true)).toEqual({ other: 'on', comments: 'on', strings: 'on' })
        expect(normalizeQuickSuggestions({ strings: 'on' })).toEqual({ other: 'on', comments: 'off', strings: 'on' })
        expect(quickSuggestionFor(normalizeQuickSuggestions({}), StandardTokenType.RegEx)).toBe('on')
    })
})
