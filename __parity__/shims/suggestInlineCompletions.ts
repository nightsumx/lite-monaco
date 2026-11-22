// SuggestInlineCompletions 的 DI 外壳:Monaco 构造参数 (@ILanguageFeaturesService, @IClipboardService, @ISuggestMemoryService, @ICodeEditorService)
// 由 InstantiationService 按位置补服务;src 的类收一个 services 对象。行为都在 src/lang/suggestinline.ts。
import { SuggestInlineCompletions as Base } from '../../src/lang/suggestinline'
import { ILanguageFeaturesService } from './languageFeatures'
import { IClipboardService } from './clipboardService'
import { ISuggestMemoryService } from './suggestMemory'
import { ICodeEditorService } from './codeEditorService'

export class SuggestInlineCompletions extends Base {
    constructor(languageFeatures?: any, clipboard?: any, memory?: any, editorService?: any) {
        super({ languageFeatures, clipboard, memory, listEditors: () => editorService.listCodeEditors() })
    }
}
ILanguageFeaturesService(SuggestInlineCompletions, undefined, 0)
IClipboardService(SuggestInlineCompletions, undefined, 1)
ISuggestMemoryService(SuggestInlineCompletions, undefined, 2)
ICodeEditorService(SuggestInlineCompletions, undefined, 3)
