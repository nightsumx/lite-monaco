// Monaco OnEnterSupport → lite-monaco core onEnter(state, before, after, previousLine)。
// 只翻译:把 {brackets, onEnterRules} 装成 onEnterConfig facet,autoIndent 数值装成编辑器选项;决策全在 src/core/edit/enter.ts。
import { EditorState } from '../../src/core/model/state'
import { onEnter, onEnterConfig, type OnEnterRuleConfig } from '../../src/core/edit/enter'
import { editorOptions } from '../../src/core/options'

const NAMES = ['none', 'keep', 'brackets', 'advanced', 'full']
const DEFAULT_BRACKETS: [string, string][] = [['(', ')'], ['{', '}'], ['[', ']']]

export class OnEnterSupport {
    private readonly _cfg: { rules: OnEnterRuleConfig[], brackets: [string, string][] }
    private readonly _states = new Map<number, EditorState>()
    constructor(opts?: { brackets?: [string, string][], onEnterRules?: unknown[] }) {
        opts = opts || {}
        this._cfg = { rules: (opts.onEnterRules ?? []) as OnEnterRuleConfig[], brackets: opts.brackets || DEFAULT_BRACKETS }
    }
    onEnter(autoIndent: number, previousLineText: string, beforeEnterText: string, afterEnterText: string) {
        let state = this._states.get(autoIndent)
        if (!state) {
            state = EditorState.create({ doc: '', extensions: [editorOptions.of({ autoIndent: NAMES[autoIndent] } as never), onEnterConfig.of(this._cfg)] })
            this._states.set(autoIndent, state)
        }
        return onEnter(state, beforeEnterText, afterEnterText, previousLineText)
    }
}
