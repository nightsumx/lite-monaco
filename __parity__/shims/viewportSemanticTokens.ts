// contrib/semanticTokens/browser/viewportSemanticTokens → src/lang/semantictokensfeature 的真实现。
// Monaco 用 @IXxx 参数装饰器注入;src 版是显式构造参数。这里只把装饰器声明(第几个参数要哪个服务)补在类上,让 createInstance 按位置注入。
import { ViewportSemanticTokensContribution as Src } from '../../src/lang/semantictokensfeature'
import { ISemanticTokensStylingService } from './semanticTokensStyling'
import { IThemeService } from './themeService'
import { IConfigurationService } from './configuration'
import { ILanguageFeatureDebounceService } from './languageFeatureDebounce'
import { ILanguageFeaturesService } from './languageFeatures'

export class ViewportSemanticTokensContribution extends Src { }
ISemanticTokensStylingService(ViewportSemanticTokensContribution, undefined, 1)
IThemeService(ViewportSemanticTokensContribution, undefined, 2)
IConfigurationService(ViewportSemanticTokensContribution, undefined, 3)
ILanguageFeatureDebounceService(ViewportSemanticTokensContribution, undefined, 4)
ILanguageFeaturesService(ViewportSemanticTokensContribution, undefined, 5)
