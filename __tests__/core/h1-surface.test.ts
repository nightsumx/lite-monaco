// H1:实例 API 面对照 Monaco 的 IEditor / ICodeEditor / IStandaloneCodeEditor 成员名(从 monaco.d.ts 抽出,见 monaco-members.json)。
// 缺的成员不让测试失败(别的代号还在补),而是把清单落到 stdout,并锁住"H1 负责的那部分一个都不缺"。
import { describe, expect, it } from 'vitest'
import { mount } from './h1-helpers'
import members from './h1-monaco-members.json'

// H1 自己负责的成员(其余归 H2 / H3 / V)
const H1_OWNED = [
    'updateOptions', 'getOption', 'getOptions', 'getRawOptions', 'onDidChangeConfiguration',
    'saveViewState', 'restoreViewState', 'hasWidgetFocus',
    'onDidFocusEditorText', 'onDidBlurEditorText', 'onDidFocusEditorWidget', 'onDidBlurEditorWidget',
    'onDidCompositionStart', 'onDidCompositionEnd', 'onDidAttemptReadOnlyEdit', 'onDidPaste',
    'onMouseDown', 'onMouseUp', 'onMouseMove', 'onMouseLeave', 'onContextMenu', 'onMouseDrop', 'onKeyDown', 'onKeyUp',
    'onDidChangeHiddenAreas', 'onDidChangeModelOptions', 'onDidChangeModelContent',
    'setValue', 'getValue', 'setModel', 'getModel', 'onWillChangeModel', 'onDidChangeModel', 'trigger',
]

describe('H1 实例 API 面', () => {
    it('H1 负责的成员都在实例上', () => {
        const { ed, done } = mount()
        const missing = H1_OWNED.filter(k => !(k in ed))
        expect(missing).toEqual([])
        done()
    })

    it('对照 Monaco 成员清单:缺口落到 stdout(信息性)', () => {
        const { ed, done } = mount()
        const missing = (members as string[]).filter(k => !(k in ed))
        // eslint-disable-next-line no-console
        console.log(`[h1-surface] Monaco IEditor/ICodeEditor/IStandaloneCodeEditor ${members.length} 个成员,实例上缺 ${missing.length}:\n${missing.join(', ')}`)
        expect(missing.length).toBeLessThan(members.length)
        done()
    })
})
