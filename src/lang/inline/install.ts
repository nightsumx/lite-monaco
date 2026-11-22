// 行内补全的装配:惰性。没有任何 provider 就不建控制器(不订阅内容事件、不分配模型);provider 一注册就补装。
import type { IDisposable, LiteMonacoEditor } from '../../api/types'
import { languageFeatures } from '../languagefeatures'
import { InlineCompletionsController } from './controller'
import { installInlineKeys } from './keys'
import { attachGhostTextView } from './view'

export function installInlineCompletions(editor: LiteMonacoEditor): void {
    queueMicrotask(() => {
        if ((editor as unknown as { destroyed?: boolean }).destroyed) return
        const registry = languageFeatures.inlineCompletionsProvider
        let controller: InlineCompletionsController | undefined
        let view: IDisposable | undefined
        let keys: IDisposable | undefined
        const ensure = () => {
            if (controller || !editor.getModel() || !registry.has(editor.getModel()!)) return
            controller = new InlineCompletionsController(editor)
            view = attachGhostTextView(editor, controller)
            keys = installInlineKeys(editor, controller)
        }
        const sub = registry.onDidChange(ensure)
        editor.onDidChangeModel(ensure)
        editor.onDestroy(() => { sub.dispose(); view?.dispose(); keys?.dispose(); controller?.dispose() })
        ensure()
    })
}
