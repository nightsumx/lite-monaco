import { describe, expect, it } from 'vitest'
import {
    ifToTernaryLine,
    functionToArrowLine,
    splitCallArgsAt,
    joinCallArgsAt,
    unwrapTernaryLine,
    toggleBooleanAt,
    promoteBindingLine,
    invertComparisonAt,
    arrowToFunctionLine,
    toggleArrowBracesLine,
    extractConstantEdit,
    flipIfElseLine,
    negateIfLine,
    toggleObjectShorthandAt,
    swapOperandsAt,
    toggleMemberAccessAt,
    toggleTrailingCommaAt,
    splitDeclLine,
    joinDeclLines,
    unwrapIfLine,
    toggleAsyncLine,
    removeBracesLine,
    inlineConstantEdit,
    toggleStrictEqAt,
    splitArrayAt,
    joinArrayAt,
    toggleIncrementAt,
    splitStringAt,
    joinStringAt,
    wrapInIfLine,
    toggleSemicolonLine,
    toggleLogAt,
    toggleHexDecAt,
    mergeIfLine,
    splitIfAndLine,
    toggleArrowParensLine,
    splitObjectAt,
    joinObjectAt,
    toggleAssignOpAt,
    toggleTypeImportLine,
    toggleExportDefaultLine,
} from '../../src/core/feature/refactor'

describe('ifToTernaryLine', () => {
    it('if/else return 收成三元', () => {
        expect(ifToTernaryLine('if (x) return a; else return b')).toBe('return x ? a : b')
        expect(ifToTernaryLine('if (x) { return 1 }')).toBeNull()
    })
})

describe('functionToArrowLine', () => {
    it('单行 function 收成箭头', () => {
        expect(functionToArrowLine('function f(x) { return x + 1 }')).toBe('const f = (x) => x + 1')
        expect(functionToArrowLine('function f(x) { foo(); return x }')).toBeNull()
    })
})

describe('splitCallArgsAt / joinCallArgsAt', () => {
    it('调用参数拆行再拼回', () => {
        const text = 'foo(a, b, c)'
        const split = splitCallArgsAt(text, 4)
        expect(split).not.toBeNull()
        const next = text.slice(0, split!.from) + split!.insert + text.slice(split!.to)
        expect(next).toBe('foo(\n  a,\n  b,\n  c\n)')
        const join = joinCallArgsAt(next, 4)
        expect(join).not.toBeNull()
        expect(next.slice(0, join!.from) + join!.insert + next.slice(join!.to)).toBe('foo(a, b, c)')
        expect(splitCallArgsAt('foo()', 1)).toBeNull()
    })
})

describe('unwrapTernaryLine', () => {
    it('return 三元拆回 if/else，再收成原式', () => {
        expect(unwrapTernaryLine('return x ? a : b')).toBe('if (x) return a; else return b')
        expect(ifToTernaryLine(unwrapTernaryLine('return x ? a : b')!)).toBe('return x ? a : b')
        expect(unwrapTernaryLine('return 1')).toBeNull()
    })
})

describe('toggleBooleanAt', () => {
    it('true ⇄ false，别的词不收', () => {
        expect(toggleBooleanAt('ok = true', 6)).toEqual({ from: 5, to: 9, insert: 'false' })
        expect(toggleBooleanAt('ok = false', 6)).toEqual({ from: 5, to: 10, insert: 'true' })
        expect(toggleBooleanAt('ok = yes', 6)).toBeNull()
    })
})

describe('promoteBindingLine', () => {
    it('var → let → const，const 停', () => {
        expect(promoteBindingLine('var x = 1')).toBe('let x = 1')
        expect(promoteBindingLine('let x = 1')).toBe('const x = 1')
        expect(promoteBindingLine('const x = 1')).toBeNull()
    })
})

describe('invertComparisonAt', () => {
    it('=== ⇄ !==，不吃箭头', () => {
        expect(invertComparisonAt('a === b', 3)).toEqual({ from: 2, to: 5, insert: '!==' })
        expect(invertComparisonAt('a !== b', 3)).toEqual({ from: 2, to: 5, insert: '===' })
        expect(invertComparisonAt('x => 1', 2)).toBeNull()
        expect(invertComparisonAt('a + b', 2)).toBeNull()
    })
})

describe('arrowToFunctionLine', () => {
    it('箭头收回 function，再变成原式', () => {
        expect(arrowToFunctionLine('const f = (x) => x + 1')).toBe('function f(x) { return x + 1 }')
        expect(functionToArrowLine(arrowToFunctionLine('const f = (x) => x + 1')!)).toBe('const f = (x) => x + 1')
        expect(arrowToFunctionLine('foo()')).toBeNull()
    })
})

describe('toggleArrowBracesLine', () => {
    it('表达式箭头 ⇄ { return }', () => {
        expect(toggleArrowBracesLine('const f = (x) => x + 1')).toBe('const f = (x) => { return x + 1 }')
        expect(toggleArrowBracesLine('const f = (x) => { return x + 1 }')).toBe('const f = (x) => x + 1')
        expect(toggleArrowBracesLine('const x = 1')).toBeNull()
    })
})

describe('extractConstantEdit', () => {
    it('选中表达式抽成 const _', () => {
        const hit = extractConstantEdit('foo(bar)', 4, 7)
        expect(hit).not.toBeNull()
        expect('foo(bar)'.slice(0, hit!.from) + hit!.insert + 'foo(bar)'.slice(hit!.to)).toBe('const _ = bar\nfoo(_)')
        expect(extractConstantEdit('foo(_)', 4, 5)).toBeNull()
        expect(extractConstantEdit('foo', 1, 1)).toBeNull()
    })
})

describe('flipIfElseLine', () => {
    it('if/else 两支对调', () => {
        expect(flipIfElseLine('if (x) return a; else return b')).toBe('if (x) return b; else return a')
        expect(flipIfElseLine(flipIfElseLine('if (x) return a; else return b')!)).toBe('if (x) return a; else return b')
        expect(flipIfElseLine('if (x) return a')).toBeNull()
    })
})

describe('negateIfLine', () => {
    it('if 条件加/去 !', () => {
        expect(negateIfLine('if (x) return 1')).toBe('if (!x) return 1')
        expect(negateIfLine('if (!x) return 1')).toBe('if (x) return 1')
        expect(negateIfLine('if (x === 1) return 1')).toBe('if (!(x === 1)) return 1')
        expect(negateIfLine('if (!(x === 1)) return 1')).toBe('if (x === 1) return 1')
        expect(negateIfLine('return 1')).toBeNull()
    })
})

describe('toggleObjectShorthandAt', () => {
    it('{ a: a } ⇄ { a }', () => {
        const a = toggleObjectShorthandAt('{ a: a }', 1)
        expect(a).not.toBeNull()
        const next = '{ a: a }'.slice(0, a!.from) + a!.insert + '{ a: a }'.slice(a!.to)
        expect(next).toBe('{ a }')
        const b = toggleObjectShorthandAt(next, 1)
        expect(b).not.toBeNull()
        expect(next.slice(0, b!.from) + b!.insert + next.slice(b!.to)).toBe('{ a: a }')
        expect(toggleObjectShorthandAt('{ a: 1 }', 1)).toBeNull()
    })
})

describe('swapOperandsAt', () => {
    it('比较两边对调，再换回来', () => {
        const hit = swapOperandsAt('a === b', 3)
        expect(hit).not.toBeNull()
        expect('a === b'.slice(0, hit!.from) + hit!.insert + 'a === b'.slice(hit!.to)).toBe('b === a')
        const back = swapOperandsAt('b === a', 3)
        expect('b === a'.slice(0, back!.from) + back!.insert + 'b === a'.slice(back!.to)).toBe('a === b')
        expect(swapOperandsAt('foo', 1)).toBeNull()
        expect(swapOperandsAt('x => 1', 2)).toBeNull()
    })
})

describe('toggleMemberAccessAt', () => {
    it("obj.foo ⇄ obj['foo']", () => {
        const a = toggleMemberAccessAt('obj.foo', 4)
        expect(a).not.toBeNull()
        const next = 'obj.foo'.slice(0, a!.from) + a!.insert + 'obj.foo'.slice(a!.to)
        expect(next).toBe("obj['foo']")
        const b = toggleMemberAccessAt(next, 4)
        expect(next.slice(0, b!.from) + b!.insert + next.slice(b!.to)).toBe('obj.foo')
        expect(toggleMemberAccessAt('obj', 1)).toBeNull()
    })
})

describe('toggleTrailingCommaAt', () => {
    it('调用参数尾逗号开关', () => {
        const a = toggleTrailingCommaAt('foo(a, b)', 4)
        expect(a).not.toBeNull()
        const next = 'foo(a, b)'.slice(0, a!.from) + a!.insert + 'foo(a, b)'.slice(a!.to)
        expect(next).toBe('foo(a, b,)')
        const b = toggleTrailingCommaAt(next, 4)
        expect(next.slice(0, b!.from) + b!.insert + next.slice(b!.to)).toBe('foo(a, b)')
        expect(toggleTrailingCommaAt('foo()', 1)).toBeNull()
    })
})

describe('splitDeclLine / joinDeclLines', () => {
    it('const 多绑定拆开再拼回', () => {
        expect(splitDeclLine('const a = 1, b = 2')).toBe('const a = 1\nconst b = 2')
        expect(joinDeclLines('const a = 1', 'const b = 2')).toBe('const a = 1, b = 2')
        expect(joinDeclLines(splitDeclLine('const a = 1, b = 2')!.split('\n')[0], splitDeclLine('const a = 1, b = 2')!.split('\n')[1])).toBe('const a = 1, b = 2')
        expect(splitDeclLine('const a = 1')).toBeNull()
    })
})

describe('unwrapIfLine', () => {
    it('无 else 的 if 拆掉，留下体', () => {
        expect(unwrapIfLine('if (x) return 1')).toBe('return 1')
        expect(unwrapIfLine('if (x) { return 1 }')).toBe('return 1')
        expect(unwrapIfLine('if (x) return 1; else return 2')).toBeNull()
    })
})

describe('toggleAsyncLine', () => {
    it('function / 箭头加/去 async', () => {
        expect(toggleAsyncLine('function f() {}')).toBe('async function f() {}')
        expect(toggleAsyncLine('async function f() {}')).toBe('function f() {}')
        expect(toggleAsyncLine('const f = (x) => 1')).toBe('const f = async (x) => 1')
        expect(toggleAsyncLine('const f = async (x) => 1')).toBe('const f = (x) => 1')
        expect(toggleAsyncLine('const x = 1')).toBeNull()
    })
})

describe('removeBracesLine', () => {
    it('if (x) { return 1 } 拆回单行体', () => {
        expect(removeBracesLine('if (x) { return 1 }')).toBe('if (x) return 1')
        expect(removeBracesLine('if (x) return 1')).toBeNull()
        expect(removeBracesLine('if (x) { a(); b() }')).toBeNull()
    })
})

describe('inlineConstantEdit', () => {
    it('抽 const _ 再内联回原文', () => {
        const doc = 'foo(bar)'
        const ex = extractConstantEdit(doc, 4, 7)
        expect(ex).not.toBeNull()
        const next = doc.slice(0, ex!.from) + ex!.insert + doc.slice(ex!.to)
        expect(next).toBe('const _ = bar\nfoo(_)')
        const back = inlineConstantEdit(next, next.length - 2)
        expect(back).not.toBeNull()
        expect(next.slice(0, back!.from) + back!.insert + next.slice(back!.to)).toBe('foo(bar)')
        expect(inlineConstantEdit('foo(bar)', 4)).toBeNull()
    })
})

describe('toggleStrictEqAt', () => {
    it('== ⇄ ===，!= ⇄ !==', () => {
        expect(toggleStrictEqAt('a == b', 3)).toEqual({ from: 2, to: 4, insert: '===' })
        expect(toggleStrictEqAt('a === b', 3)).toEqual({ from: 2, to: 5, insert: '==' })
        expect(toggleStrictEqAt('a != b', 3)).toEqual({ from: 2, to: 4, insert: '!==' })
        expect(toggleStrictEqAt('a + b', 2)).toBeNull()
    })
})

describe('splitArrayAt / joinArrayAt', () => {
    it('数组字面量拆行再拼回', () => {
        const text = '[a, b, c]'
        const split = splitArrayAt(text, 1)
        expect(split).not.toBeNull()
        const next = text.slice(0, split!.from) + split!.insert + text.slice(split!.to)
        expect(next).toBe('[\n  a,\n  b,\n  c\n]')
        const join = joinArrayAt(next, 1)
        expect(join).not.toBeNull()
        expect(next.slice(0, join!.from) + join!.insert + next.slice(join!.to)).toBe('[a, b, c]')
        expect(splitArrayAt('[a]', 1)).toBeNull()
    })
})

describe('toggleIncrementAt', () => {
    it('i++ ⇄ ++i', () => {
        expect(toggleIncrementAt('i++', 0)).toEqual({ from: 0, to: 3, insert: '++i' })
        expect(toggleIncrementAt('++i', 0)).toEqual({ from: 0, to: 3, insert: 'i++' })
        expect(toggleIncrementAt('i + 1', 1)).toBeNull()
    })
})

describe('splitStringAt', () => {
    it('在引号内光标处拆成拼接', () => {
        const hit = splitStringAt("'hello'", 3)
        expect(hit).not.toBeNull()
        expect("'hello'".slice(0, hit!.from) + hit!.insert + "'hello'".slice(hit!.to)).toBe("'he' + 'llo'")
        expect(splitStringAt("'hello'", 1)).toBeNull()
        expect(splitStringAt('hello', 2)).toBeNull()
    })
})

describe('joinStringAt', () => {
    it("拆开的 'he' + 'llo' 拼回", () => {
        const split = splitStringAt("'hello'", 3)!
        const next = "'hello'".slice(0, split.from) + split.insert + "'hello'".slice(split.to)
        expect(next).toBe("'he' + 'llo'")
        const join = joinStringAt(next, 3)
        expect(join).not.toBeNull()
        expect(next.slice(0, join!.from) + join!.insert + next.slice(join!.to)).toBe("'hello'")
        expect(joinStringAt("'hello'", 3)).toBeNull()
    })
})

describe('wrapInIfLine', () => {
    it('包进 if (true)，再 unwrap 回来', () => {
        expect(wrapInIfLine('return 1')).toBe('if (true) return 1')
        expect(unwrapIfLine(wrapInIfLine('return 1')!)).toBe('return 1')
        expect(wrapInIfLine('if (x) return 1')).toBeNull()
    })
})

describe('toggleSemicolonLine', () => {
    it('行尾分号开关', () => {
        expect(toggleSemicolonLine('const x = 1')).toBe('const x = 1;')
        expect(toggleSemicolonLine('const x = 1;')).toBe('const x = 1')
        expect(toggleSemicolonLine('if (x)')).toBeNull()
        expect(toggleSemicolonLine('{')).toBeNull()
    })
})

describe('toggleLogAt', () => {
    it('console.log 包/拆', () => {
        const w = toggleLogAt('foo', 0, 3)
        expect(w).not.toBeNull()
        expect('foo'.slice(0, w!.from) + w!.insert + 'foo'.slice(w!.to)).toBe('console.log(foo)')
        const u = toggleLogAt('console.log(foo)', 12, 12)
        expect(u).not.toBeNull()
        expect('console.log(foo)'.slice(0, u!.from) + u!.insert + 'console.log(foo)'.slice(u!.to)).toBe('foo')
        expect(toggleLogAt('   ', 1, 1)).toBeNull()
    })
})

describe('toggleHexDecAt', () => {
    it('255 ⇄ 0xff', () => {
        expect(toggleHexDecAt('255', 0)).toEqual({ from: 0, to: 3, insert: '0xff' })
        expect(toggleHexDecAt('0xff', 1)).toEqual({ from: 0, to: 4, insert: '255' })
        expect(toggleHexDecAt('1.5', 0)).toBeNull()
        expect(toggleHexDecAt('foo', 1)).toBeNull()
    })
})

describe('mergeIfLine / splitIfAndLine', () => {
    it('if (a) if (b) ⇄ if (a && b)', () => {
        expect(mergeIfLine('if (a) if (b) return 1')).toBe('if (a && b) return 1')
        expect(splitIfAndLine('if (a && b) return 1')).toBe('if (a) if (b) return 1')
        expect(splitIfAndLine(mergeIfLine('if (a) if (b) return 1')!)).toBe('if (a) if (b) return 1')
        expect(mergeIfLine('if (a) return 1')).toBeNull()
        expect(splitIfAndLine('if (a) return 1')).toBeNull()
    })
})

describe('toggleArrowParensLine', () => {
    it('x => ⇄ (x) =>', () => {
        expect(toggleArrowParensLine('const f = x => 1')).toBe('const f = (x) => 1')
        expect(toggleArrowParensLine('const f = (x) => 1')).toBe('const f = x => 1')
        expect(toggleArrowParensLine('const f = (x, y) => 1')).toBeNull()
    })
})

describe('splitObjectAt / joinObjectAt', () => {
    it('对象字面量拆行再拼回', () => {
        const text = '{ a: 1, b: 2 }'
        const split = splitObjectAt(text, 1)
        expect(split).not.toBeNull()
        const next = text.slice(0, split!.from) + split!.insert + text.slice(split!.to)
        expect(next).toBe('{\n  a: 1,\n  b: 2\n}')
        const join = joinObjectAt(next, 1)
        expect(join).not.toBeNull()
        expect(next.slice(0, join!.from) + join!.insert + next.slice(join!.to)).toBe('{a: 1, b: 2}')
        expect(splitObjectAt('{ a: 1 }', 1)).toBeNull()
    })
})

describe('toggleAssignOpAt', () => {
    it('x = x + 1 ⇄ x += 1', () => {
        expect(toggleAssignOpAt('x = x + 1', 2)).toMatchObject({ from: 0, to: 9, insert: 'x += 1' })
        expect(toggleAssignOpAt('x += 1', 2)).toMatchObject({ from: 0, to: 6, insert: 'x = x + 1' })
        expect(toggleAssignOpAt('x = y + 1', 2)).toBeNull()
    })
})

describe('toggleTypeImportLine', () => {
    it('import ⇄ import type', () => {
        expect(toggleTypeImportLine("import { x } from 'm'")).toBe("import type { x } from 'm'")
        expect(toggleTypeImportLine("import type { x } from 'm'")).toBe("import { x } from 'm'")
        expect(toggleTypeImportLine("const x = 1")).toBeNull()
    })
})

describe('toggleExportDefaultLine', () => {
    it('export function ⇄ export default function', () => {
        expect(toggleExportDefaultLine('export function f() {}')).toBe('export default function f() {}')
        expect(toggleExportDefaultLine('export default function f() {}')).toBe('export function f() {}')
        expect(toggleExportDefaultLine('export const x = 1')).toBeNull()
    })
})
