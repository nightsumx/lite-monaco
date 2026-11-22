// H1 测试共用:假高亮器 + 挂载。不是测试文件(vitest 只收 *.test.ts)。
import { liteMonaco } from '../../src/litemonaco'
import type { ShikiLike, LiteMonacoOptions } from '../../src/litemonaco'
import type { LiteMonacoEditor } from '../../src/api/types'

export function fakeHl(): ShikiLike {
    return {
        codeToTokens: (code: string) => ({ tokens: [[{ content: code, offset: 0, color: '#d4d4d4' }]] }),
        getLastGrammarState: () => ({ getScopes: () => undefined }),
        getLoadedLanguages: () => ['typescript', 'text'],
        getTheme: () => ({ bg: '#1e1e1e', fg: '#d4d4d4', type: 'dark' as const }),
    } as unknown as ShikiLike
}

/** 关掉会慢或会异步的东西,只留编辑器本体 */
export const QUIET = { autocomplete: false, tsDiagnostics: false, hover: false, signatureHelp: false, codeActions: false, stickyScroll: false } as const

export function mount(over: Partial<LiteMonacoOptions> = {}): { ed: LiteMonacoEditor, parent: HTMLElement, done: () => void } {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const ed = liteMonaco({
        parent, highlighter: fakeHl(), doc: 'one\ntwo\nthree\nfour', lang: 'text',
        ...over,
        features: { ...QUIET, ...over.features },
    })
    return { ed, parent, done: () => { ed.destroy(); parent.remove() } }
}
