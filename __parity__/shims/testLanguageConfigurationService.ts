// Monaco TestLanguageConfigurationService → lite-monaco languages.setLanguageConfiguration(全局注册表,dispose 撤销这一次)。
import { setLanguageConfiguration, getLanguageConfiguration } from '../../src/api/languages'
import { getLanguageBrackets } from '../../src/api/bracketpairs'
export class TestLanguageConfigurationService {
    private readonly _ds: { dispose(): void }[] = []
    register(languageId: string, configuration: any, priority?: number) {
        const d = setLanguageConfiguration(languageId, configuration, priority)
        this._ds.push(d)
        return d
    }
    // Monaco 返回的是 ResolvedLanguageConfiguration:comments 里多一套 lineCommentToken / blockComment{Start,End}Token(原字段照留)
    getLanguageConfiguration(languageId: string): any {
        const cfg = getLanguageConfiguration(languageId)
        // Monaco ResolvedLanguageConfiguration.bracketsNew:该语言的括号种类表(src 的 getLanguageBrackets,同一份配置恒同一个对象)
        const bracketsNew = getLanguageBrackets(languageId)
        if (!cfg) return { bracketsNew }
        // Monaco 的 ResolvedLanguageConfiguration.indentRulesSupport(有 indentationRules 才有);规则本身就是那四条正则
        if (cfg.indentationRules) (cfg as any).indentRulesSupport = cfg.indentationRules
        const c = cfg.comments
        if (!c) return { ...cfg, bracketsNew }
        const lc = c.lineComment
        return { ...cfg, bracketsNew, comments: { ...c, lineCommentToken: typeof lc === 'string' ? lc : lc?.comment, blockCommentStartToken: c.blockComment?.[0], blockCommentEndToken: c.blockComment?.[1] } }
    }
    dispose() { for (const d of this._ds.splice(0)) d.dispose() }
}
