// SuggestController 的 DI 外壳:Monaco 构造参数 (editor, @ISuggestMemoryService, @ICommandService, @IContextKeyService, @IInstantiationService,
// @ILogService, @ITelemetryService) 由 InstantiationService 按位置补;src 的类收 (editor, services{...})。这里只把位置参数翻成那个对象,
// 以及补上 SuggestModel 要的那几项(词距取词服务 / 剪贴板 / 语言特性 / 环境)——它们在 Monaco 里是 SuggestModel 自己的 DI,翻译层统一从同一个服务表取。
import { SuggestController as Base, type SuggestControllerServices } from '../../src/lang/suggestcontroller'
import { ISuggestMemoryService } from './suggestMemory'
import { IContextKeyService } from './contextkey'
import { ILogService } from './log'
import { IInstantiationService } from './instantiation'
import { IEditorWorkerService } from './editorWorker'
import { IClipboardService } from './clipboardService'
import { ILanguageFeaturesService } from './languageFeatures'
import { IEnvironmentService } from './environment'
import { SnippetController2 } from './snippetController2'

export class SuggestController extends Base {
    constructor(editor: any, memory?: unknown, _commands?: unknown, _ctx?: unknown, inst?: any, log?: unknown) {
        const get = (id: unknown) => inst?.get?.(id)
        const services: SuggestControllerServices = {
            memory: memory as SuggestControllerServices['memory'],
            log: log as SuggestControllerServices['log'],
            wordRanges: get(IEditorWorkerService),
            clipboard: get(IClipboardService),
            languageFeatures: get(ILanguageFeaturesService),
            env: get(IEnvironmentService),
            snippets: () => editor.getContribution?.(SnippetController2.ID),
        }
        super(editor, services)
    }
}
ISuggestMemoryService(SuggestController, undefined, 1)
IContextKeyService(SuggestController, undefined, 3)
IInstantiationService(SuggestController, undefined, 4)
ILogService(SuggestController, undefined, 5)
