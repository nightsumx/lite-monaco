// common/services/semanticTokensProviderStyling → src/lang/semantictokens 的真实现。
// Monaco 用 @IThemeService / @ILanguageService / @ILogService 参数装饰器注入(legend 在前);src 版是显式构造参数,这里只补装饰器声明让 createInstance 按位置注入。
import { SemanticTokensProviderStyling as Src, toMultilineTokens2 } from '../../src/lang/semantictokens'
import { IThemeService } from './themeService'
import { ILanguageService } from './language'
import { ILogService } from './log'

export class SemanticTokensProviderStyling extends Src { }
IThemeService(SemanticTokensProviderStyling, undefined, 1)
ILanguageService(SemanticTokensProviderStyling, undefined, 2)
ILogService(SemanticTokensProviderStyling, undefined, 3)
export { toMultilineTokens2 }
