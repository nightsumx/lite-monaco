// SnippetController2 的 DI 外壳:Monaco 里构造参数带 @IXxx 装饰器,由 InstantiationService 按位置补服务;src 的类是无 DI 的纯构造器。
// 这里只给同一个类标注「第 i 个参数要哪个服务」,不改行为。子类(如测试里的 TestSnippetController)继承 $di。
import { SnippetController2 } from '../../src/api/snippetcontroller'
import { ILogService } from './log'
import { IContextKeyService } from './contextkey'
import { ILanguageConfigurationService } from './languageConfigurationRegistry'
ILogService(SnippetController2, undefined, 1)
IContextKeyService(SnippetController2, undefined, 3)
ILanguageConfigurationService(SnippetController2, undefined, 4)
export { SnippetController2 }
