// 括号 token 的词法规则:一份括号文本 → 一条正则(Monaco BracketTokens / LanguageAgnosticBracketTokens)。
//
// 括号树(api/bracketpairs)和实时扫描(edit/brackets:匹配高亮 / 彩虹括号 / 跳转)认的是同一种括号,
// 所以规则只写这一份:
//   - 全部括号文本拼成一条交替正则,key 排序后反转 —— 同前缀的长括号排在短括号前面('(*' 先于 '(','<!--' 先于 '<'),
//     不会从一个更长的括号中间起头
//   - 大小写不敏感('gi'),查表时用 match.toLowerCase()
//   - 以字母 / 空格起头或收尾的括号(begin / end / if / fi)两端要词边界:endpoint 里的 end、diff 里的 if 不是括号
// 括号 token 不跨行(Monaco 的 token 是逐行的),调用方一行一行喂。

/** 括号文本 → 正则片段;字母起止的加 \b */
export function prepareBracketForRegExp(str: string): string {
    let escaped = str.replace(/[\\{}*+?|^$.[\]()]/g, '\\$&')
    if (/^[\w ]+/.test(str)) escaped = `\\b${escaped}`
    if (/[\w ]+$/.test(str)) escaped = `${escaped}\\b`
    return escaped
}

/** 全部括号文本拼成一条全局正则;没有括号返回 null */
export function bracketRegExp(texts: Iterable<string>): RegExp | null {
    const keys = [...texts].sort().reverse()
    return keys.length ? new RegExp(keys.map(prepareBracketForRegExp).join('|'), 'gi') : null
}

/**
 * 在 text(一行,或一段 Other token)里依次找括号,回调收 (下标, 匹配到的原文);回调返回 false 停。
 * 每次从上一个匹配的末尾重新切片再匹配,同 Monaco(TextBufferTokenizer 里 `line.substring(off, end)` 循环):词边界按切片两端算。
 */
export function eachBracketMatch(re: RegExp, text: string, fn: (index: number, match: string) => boolean | void): void {
    let off = 0
    while (off < text.length) {
        re.lastIndex = 0
        const m = re.exec(off ? text.slice(off) : text)
        if (!m) return
        const index = off + m.index
        off = index + m[0].length
        if (fn(index, m[0]) === false) return
    }
}
