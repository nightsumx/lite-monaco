// Monaco TokenizationRegistry(测试里 registerTokenizationSupport 往里注册 ITokenizationSupport)→ lite-monaco 的外部 token 类型来源(core setTokenTypeSource)。
// 只做翻译:把 support.tokenizeEncoded 吐出的 metadata 里的 StandardTokenType 位段读出来,按行缓存给 core 查。
// Monaco 的 tokenize 是有状态且按行顺序调一次的(测试夹具里 tokens[lineIndex++]),所以这里在第一次被问时从第 1 行起把整篇顺序跑一遍并缓存;
// 之后文档变了,文本没变的行(按行号 + 文本比对)沿用缓存,变了的行当 Other —— 不再回头调 tokenizer。
import { setTokenTypeSource, cachedTokenTypeAt } from '../../src/core/edit/brackets'
import { setCommentTokensSource } from '../../src/core/edit/commenttokens'
import { commentTokensOf } from '../../src/lang/langconfig'
import { getLanguageConfiguration } from '../../src/api/languages'
import { languageIdCodec } from './languageService'
import { TokenizationRegistry } from '../../../../reference/_vscode-src/src/vs/editor/common/languages'

interface Entry { text: string, spans: number[], lang: string, startState?: unknown } // lang = 行首 token 的语言 // [from, to, type, ...]

function tokenizeAll(lines: string[], support: any): Entry[] {
    const out: Entry[] = []
    let state = support.getInitialState()
    for (let i = 0; i < lines.length; i++) {
        let r: any
        try { r = support.tokenizeEncoded(lines[i], i < lines.length - 1, state) } catch { break }
        const t: Uint32Array = r.tokens
        const spans: number[] = []
        // tokenizeEncoded 吐出的是 [startOffset, metadata] 对;Monaco 的 TextModel 取走后马上 LineTokens.convertToEndOffset(token k 覆盖 [start_k, start_k+1),最后一个延到行尾)
        for (let k = 0; k < t.length; k += 2) spans.push(t[k], k + 2 >= t.length ? lines[i].length : t[k + 2], (t[k + 1] & 0x300) >>> 8)
        const startState = state
        out.push({ text: lines[i], startState, spans, lang: t.length ? languageIdCodec.decodeLanguageId(t[1] & 0xFF) : '' })
        state = r.endState
    }
    return out
}

export function installTokenBridge(view: any): void {
    // done = 已经 tokenize 过的前缀行数(Monaco 的 firstInvalidEndStateLineNumber - 1):没人问过 token 之前是 0,问过一次整篇顺序跑完。
    let cache: { support: unknown, lines: Entry[], done: number } | null = null
    setTokenTypeSource(view, (doc) => {
        const lang: string | undefined = view.getModel?.()?.getLanguageId?.()
        const support = lang ? TokenizationRegistry.get(lang) : null
        // Monaco:没注册 tokenization support 的语言整篇都是 Other(不会按 C 系语法去猜字符串 / 注释);内置词法器只是宿主没给 token 时的兜底启发式
        if (!support) return { typeAt: () => 0 }
        if (!cache || cache.support !== support) cache = { support, lines: [], done: 0 }
        const c = cache
        const ensure = () => { if (!c.done) { c.lines = tokenizeAll(doc.toJSON(), support); c.done = c.lines.length } }
        return {
            // Monaco TokenizerWithStateStoreAndTextModel.isCheapToTokenize:在已 tokenize 的前缀之内,或正好是第一条没 tokenize 的短行
            cheap: (line) => line <= c.done || (line === c.done + 1 && doc.line(line).length < 2000),
            // Monaco getTokenTypeIfInsertingCharacter:在这一行的起始状态上,把 ch 插进去重新 tokenize,取 ch 所在 token 的类型
            typeIfInserting(pos: number, ch: string) {
                ensure()
                const line = doc.lineAt(pos)
                const e = c.lines[line.number - 1]
                if (!e || e.text !== line.text) return 0
                const text = line.text.slice(0, pos - line.from) + ch + line.text.slice(pos - line.from)
                let r: any
                try { r = support.tokenizeEncoded(text, false, e.startState) } catch { return 0 }
                const t: Uint32Array = r.tokens
                const off = pos - line.from
                for (let k = 0; k < t.length; k += 2) {
                    const end = k + 2 < t.length ? t[k + 2] : text.length
                    if (t[k] <= off && off < end) return (t[k + 1] & 0x300) >>> 8
                }
                return 0
            },
            typeAt(pos) {
                ensure()
                // 夹具的 tokenizeEncoded 按调用次数吐行、只能跑一遍,渲染(src tokenbridge)已经把它用掉了:这时类型读渲染留下的那份 token store(Monaco 同:只有一份)
                if (!c.lines.length) return cachedTokenTypeAt(view, doc, pos)
                const line = doc.lineAt(pos)
                const e = c.lines[line.number - 1]
                if (!e || e.text !== line.text) return 0
                const off = Math.min(pos - line.from, Math.max(0, line.length - 1))
                for (let k = 0; k < e.spans.length; k += 3) if (e.spans[k] <= off && off < e.spans[k + 1]) return e.spans[k + 2]
                return 0
            },
        }
    })
    // Monaco model.getLanguageIdAtPosition(行, 1):行首 token 的语言 → 那门语言的注释符(内嵌语言;没有 tokenizer 的行用整个编辑器的语言)
    setCommentTokensSource(view, (doc) => {
        const lang: string | undefined = view.getModel?.()?.getLanguageId?.()
        const support = lang ? TokenizationRegistry.get(lang) : null
        if (!support) return undefined
        if (!cache || cache.support !== support) cache = { support, lines: [], done: 0 }
        const c = cache
        if (!c.done) { c.lines = tokenizeAll(doc.toJSON(), support); c.done = c.lines.length }
        return (pos) => {
            const line = doc.lineAt(pos)
            const e = c.lines[line.number - 1]
            if (!e || !e.lang || e.lang === lang) return undefined
            const cfg = getLanguageConfiguration(e.lang)
            return cfg ? commentTokensOf(cfg) ?? { none: true } : { none: true }
        }
    })
}
