// Monaco LanguageService → lite-monaco languages.register(语言表只增不减,dispose 无需撤销)。
import { register, setLanguageConfiguration, getLanguageConfiguration } from '../../src/api/languages'
// 语言 id 编码表:用 src 的那份(分词层按它解码 token 元数据里的语言 id)
import { getLanguageService } from '../../src/api/languagesregistry'
const codec = getLanguageService().languageIdCodec
export const languageIdCodec = codec
export class LanguageService {
    registerLanguage(lang: { id: string }) {
        register(lang as never)
        // Monaco:已注册但没配置的语言 = 空配置(没有括号 / 回车规则);lite-monaco 对「没配置」会回落到内置 C 系表,所以显式登记一份空括号表(优先级最低,真配置照常盖过)
        if (!getLanguageConfiguration(lang.id)) setLanguageConfiguration(lang.id, { brackets: [] }, -1)
        return { dispose() {} }
    }
    // Monaco createById:语言选择(只带 id;ModelService.createModel 取 languageId)
    createById(languageId: string | null | undefined) { return { languageId: languageId ?? 'plaintext', onDidChange: () => ({ dispose() {} }) } }
    // Monaco 的 languageId 编码(数字);lite-monaco 只用字符串 id,这里按注册顺序给个稳定数字
    languageIdCodec = codec
    dispose() {}
}
