// common/services/languageFeatureDebounce → src/lang/featuredebounce 的真实现。
import { createDecorator } from './instantiation'
export const ILanguageFeatureDebounceService: any = createDecorator()
export { LanguageFeatureDebounceService } from '../../src/lang/featuredebounce'
