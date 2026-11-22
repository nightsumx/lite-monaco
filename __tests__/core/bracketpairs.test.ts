import { describe, expect, it } from 'vitest'
import { createModel } from '../../src/api/model'
import { setLanguageConfiguration } from '../../src/api/languages'
import { ModesRegistry } from '../../src/api/languagesregistry'
import { getLanguageBrackets } from '../../src/api/bracketpairs'

for (const id of ['bp-test', 'bp-test2', 'bp-test3']) ModesRegistry.registerLanguage({ id })
describe('model.bracketPairs:多字符括号 / 配置对象', () => {
    it('begin/end 与单字符括号混合配对,嵌套层级对', () => {
        const d = setLanguageConfiguration('bp-test', { brackets: [['{', '}'], ['begin', 'end'], ['if', 'end if']] })
        const m = createModel('begin { x } end\nif a end if', 'bp-test')
        const pairs = m.bracketPairs.getBracketPairsInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 12 }).toArray()
        expect(pairs.map(p => [p.openingBracketInfo.bracketText, p.closingBracketInfo?.bracketText, p.nestingLevel]))
            .toEqual([['begin', 'end', 0], ['{', '}', 1], ['if', 'end if', 0]])
        m.dispose(); d.dispose()
    })
    it('begin 不会从 beginning 中间匹配;end 的词边界', () => {
        const d = setLanguageConfiguration('bp-test2', { brackets: [['begin', 'end']] })
        const m = createModel('beginning ending begin end', 'bp-test2')
        expect(m.bracketPairs.getBracketPairsInRange(m.getFullModelRange()).toArray()).toHaveLength(1)
        expect(m.bracketPairs.findPrevBracket({ lineNumber: 1, column: 12 })).toBeNull() // beginning / ending 里没有括号
        m.dispose(); d.dispose()
    })
    it('getLanguageBrackets:同一配置恒同一对象,配置变了换新', () => {
        const d = setLanguageConfiguration('bp-test3', { brackets: [['(', ')']] })
        const a = getLanguageBrackets('bp-test3')
        expect(getLanguageBrackets('bp-test3')).toBe(a)
        const d2 = setLanguageConfiguration('bp-test3', { brackets: [['[', ']']] })
        expect(getLanguageBrackets('bp-test3')).not.toBe(a)
        d2.dispose(); d.dispose()
    })
})
