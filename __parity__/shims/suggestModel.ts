// SuggestModel 的 DI 外壳:Monaco 构造参数 (editor, @IEditorWorkerService, @IClipboardService, @ITelemetryService, @ILogService,
// @IContextKeyService, @IConfigurationService, @ILanguageFeaturesService, @IEnvironmentService) 由 InstantiationService 按位置补服务;
// src 的类收 (editor, services{...}) 一个对象。这里只把位置参数翻成那个对象,行为都在 src/lang/suggestmodel.ts。
import { SuggestModel as Base, LineContext, type SuggestModelServices } from '../../src/lang/suggestmodel'
import { IEditorWorkerService } from './editorWorker'
import { IClipboardService } from './clipboardService'
import { ITelemetryService } from './telemetry'
import { ILogService } from './log'
import { IContextKeyService } from './contextkey'
import { ILanguageFeaturesService } from './languageFeatures'
import { IEnvironmentService } from './environment'

export class SuggestModel extends Base {
    constructor(editor: ConstructorParameters<typeof Base>[0], workerService?: unknown, clipboard?: unknown, _telemetry?: unknown, log?: unknown, _contextKeys?: unknown, _config?: unknown, languageFeatures?: unknown, env?: unknown) {
        const services: SuggestModelServices = {
            wordRanges: workerService as SuggestModelServices['wordRanges'],
            clipboard: clipboard as SuggestModelServices['clipboard'],
            log: log as SuggestModelServices['log'],
            languageFeatures: languageFeatures as SuggestModelServices['languageFeatures'],
            env: env as SuggestModelServices['env'],
        }
        super(editor, services)
    }
}
IEditorWorkerService(SuggestModel, undefined, 1)
IClipboardService(SuggestModel, undefined, 2)
ITelemetryService(SuggestModel, undefined, 3)
ILogService(SuggestModel, undefined, 4)
IContextKeyService(SuggestModel, undefined, 5)
ILanguageFeaturesService(SuggestModel, undefined, 7)
IEnvironmentService(SuggestModel, undefined, 8)
export { LineContext }
