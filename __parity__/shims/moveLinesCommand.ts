// Monaco MoveLinesCommand(sel, moveDown, autoIndent, languageConfigurationService) → lite-monaco moveLinesUp/Down 动作。
// autoIndent(EditorAutoIndentStrategy 枚举值 0..4)翻成编辑器选项 autoIndent。语言配置由 languageConfigurationService 的 register 已写进 lite-monaco 注册表。
import { lmCommand } from './testCommand'
const NAMES = ['none', 'keep', 'brackets', 'advanced', 'full']
export const MoveLinesCommand = class {
    constructor(_sel: unknown, moveDown: boolean, autoIndent: number, _languageConfigurationService?: unknown) {
        return lmCommand(editor => {
            editor.updateOptions({ autoIndent: NAMES[autoIndent] })
            editor.getAction(moveDown ? 'editor.action.moveLinesDownAction' : 'editor.action.moveLinesUpAction')!.run()
        }) as never
    }
}
