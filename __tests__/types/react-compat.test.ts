// @vitest-environment node
// react-compat.test-d.ts 在 vitest 里编译一遍,一条诊断都不许有(tsc -p . 也包含它,这里让 bun run test 一样能挡住)。
// 它断言:lite-monaco/react 的出口、props、组件、loader 能顶替 @monaco-editor/react 4.7.0;回调拿到的 monaco 整个能当
// monaco-editor 0.55.1 的 editor.main 用,除了文件里列明的「没有的」。
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compatDiagnostics, rootDir } from './monaco-types-gen'

describe('lite-monaco/react 类型层顶替 @monaco-editor/react', () => {
    it('react-compat.test-d.ts 没有类型错误', () => {
        expect(compatDiagnostics(resolve(rootDir, '__tests__/types/react-compat.test-d.ts'), 3)).toEqual([])
    }, 60_000)
})
