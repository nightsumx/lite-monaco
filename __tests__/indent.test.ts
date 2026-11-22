import { describe, it, expect } from 'vitest'
import { indentDepth, detectIndentWidth } from '../src/core/edit/indent'

describe('indentDepth', () => {
    it('无缩进 → 0', () => {
        expect(indentDepth('const x = 1', 4)).toBe(0)
    })

    it('纯空格:每 tabSize 列一级', () => {
        expect(indentDepth('    x', 4)).toBe(1) // 4 空格 = 1 级
        expect(indentDepth('        x', 4)).toBe(2) // 8 空格 = 2 级
        expect(indentDepth('      x', 4)).toBe(1) // 6 空格 = 1 级(向下取整)
    })

    it('纯 Tab:每个 Tab 一级', () => {
        expect(indentDepth('\tx', 4)).toBe(1)
        expect(indentDepth('\t\tx', 4)).toBe(2)
    })

    it('Tab+空格混合:Tab 按 tabSize 边界展开', () => {
        // Tab 跳到列 4,再 4 空格到列 8 = 2 级
        expect(indentDepth('\t    x', 4)).toBe(2)
        // 2 空格(列 2)+ Tab 跳到列 4(非 +4)= 1 级
        expect(indentDepth('  \tx', 4)).toBe(1)
    })

    it('空行/纯空白行:按空白折算', () => {
        expect(indentDepth('        ', 4)).toBe(2) // 8 空格纯空白行 = 2 级
        expect(indentDepth('', 4)).toBe(0)
    })

    it('单位=2:周期变 2', () => {
        expect(indentDepth('    x', 2)).toBe(2) // 4 空格 / 2 = 2 级
        expect(indentDepth('\tx', 2)).toBe(1)
    })
})

describe('detectIndentWidth', () => {
    it('2 空格代码 → 探测出 2(不被 tabSize=4 误判)', () => {
        // 这正是 demo 的 bug:2 空格缩进若按 tabSize=4 算深度全 0;探测纠正为 2
        const lines = ['interface User {', '  id: number', '  name: string', '}']
        expect(detectIndentWidth(lines, 4)).toBe(2)
    })

    it('4 空格代码 → 4', () => {
        expect(detectIndentWidth(['function f() {', '    return 1', '}'], 4)).toBe(4)
    })

    it('取最小非零缩进当单位:深层不干扰', () => {
        // 有 2 空格行也有 4 空格行 → 单位是最小的 2
        expect(detectIndentWidth(['{', '  a', '    b', '  c'], 4)).toBe(2)
    })

    it('全无缩进 → 回退 tabSize', () => {
        expect(detectIndentWidth(['const x = 1', 'const y = 2'], 4)).toBe(4)
    })

    it('Tab 缩进 → 展开成 tabSize 列', () => {
        expect(detectIndentWidth(['{', '\ta', '}'], 4)).toBe(4)
    })
})

describe('detectIndentWidth —— VS Code guessIndentation(按相邻行缩进差计票)', () => {
    it('JSDoc 的 ` * `(1 空格)不把单位拉成 1', () => {
        const lines = ['/**', ' * doc', ' */', 'function f() {', '    if (x) {', '        y()', '    }', '}']
        expect(detectIndentWidth(lines, 4)).toBe(4)
    })
    it('开头一行续行对齐(1 空格)不影响 2 空格文件', () => {
        const lines = ['const a = [1,', ' 2]', 'if (a) {', '  b()', '  if (c) {', '    d()', '  }', '}']
        expect(detectIndentWidth(lines, 4)).toBe(2)
    })
    it('tab 缩进多于空格 → tabSize', () => {
        expect(detectIndentWidth(['{', '\ta', '\t\tb', ' * x', '}'], 8)).toBe(8)
    })
    it('空行不参与(不打断相邻差)', () => {
        expect(detectIndentWidth(['a', '', '   b', '', '      c'], 4)).toBe(3)
    })
})
