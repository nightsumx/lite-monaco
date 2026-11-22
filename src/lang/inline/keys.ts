// 行内补全的键位(Monaco inlineCompletions/browser/controller/commands.ts 的默认键):
//   Tab 接受 · Esc 取消 · Alt+] / Alt+[ 切下一个 / 上一个 · Alt+\ 显式触发 · ⌘/Ctrl+→ 接受下一个词
// 走实例级键位表(与 addAction 同一条路径),比内置 Tab=缩进 / Esc=清选区先到;命令返回 false = 放行给内置键。
import { addViewKeybinding } from '../../api/commands'
import { KeyCode, KeyMod } from '../../api/keycodes'
import type { IDisposable, LiteMonacoEditor } from '../../api/types'
import type { InlineCompletionsController } from './controller'

// 补全下拉开着时 Tab / Esc 归下拉;行内建议可见才响应
const VISIBLE = 'inlineSuggestionVisible && !suggestWidgetVisible && !editorReadonly'

export function installInlineKeys(editor: LiteMonacoEditor, controller: InlineCompletionsController): IDisposable {
    const view = editor as never
    const bind = (keybinding: number, when: string, run: () => unknown): IDisposable | null => addViewKeybinding(view, keybinding, when, run)
    const model = () => controller.model

    const subs = [
        bind(KeyCode.Tab, VISIBLE, () => {
            const m = model()
            if (!m || m.tabShouldIndent) return false // 光标在缩进里:Tab 该缩进
            void m.accept()
        }),
        bind(KeyCode.Escape, VISIBLE, () => { const m = model(); if (!m) return false; m.stop('explicitCancel') }),
        bind(KeyMod.Alt | KeyCode.BracketRight, VISIBLE, () => { void model()?.next() }),
        bind(KeyMod.Alt | KeyCode.BracketLeft, VISIBLE, () => { void model()?.previous() }),
        bind(KeyMod.CtrlCmd | KeyCode.RightArrow, VISIBLE, () => { const m = model(); if (!m) return false; void m.acceptNextWord() }),
        // 显式触发:没有可见建议时也要能按(所以不带 VISIBLE)
        bind(KeyMod.Alt | KeyCode.Backslash, '!editorReadonly', () => { void model()?.trigger({ explicit: true, noDelay: true }) }),
    ]
    return { dispose() { for (const s of subs) s?.dispose() } }
}
