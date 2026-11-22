// StickyScrollController 的 DI 外壳:Monaco 里构造参数带 @IXxx 装饰器,由 InstantiationService 按位置补服务;src 的类是无 DI 的纯构造器。
// 这里只标注「第 i 个参数要哪个服务」,不改行为。
import { StickyScrollController } from '../../src/lang/stickymodel'
import { ILanguageFeaturesService } from './languageFeatures'
ILanguageFeaturesService(StickyScrollController, undefined, 1)
export { StickyScrollController }
