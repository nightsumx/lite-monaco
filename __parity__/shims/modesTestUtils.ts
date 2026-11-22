// Monaco test/common/modesTestUtils:createFakeScopedLineTokens 原版靠 LineTokens + LanguageIdCodec(拖进 platform 注册表)。
// lite-monaco 的 token 来自外部 token 源 / 词法器,没有 ScopedLineTokens;这里只把夹具数据(TokenText[])摆成被测代码要的 4 个读取口,不含任何被测判定。
export interface TokenText { text: string, type: number }

export function createFakeScopedLineTokens(rawTokens: TokenText[]) {
    const ends: number[] = []
    let line = ''
    for (const t of rawTokens) { line += t.text; ends.push(line.length) }
    return {
        getLineContent: () => line,
        getTokenCount: () => rawTokens.length,
        // 同 LineTokens.findTokenIndexAtOffset:第一个 endOffset > offset 的 token;越界夹到最后一个
        findTokenIndexAtOffset: (offset: number) => {
            if (!rawTokens.length) return 0
            const i = ends.findIndex(e => e > offset)
            return i < 0 ? rawTokens.length - 1 : i
        },
        getStandardTokenType: (i: number) => rawTokens[i]?.type ?? 0,
    }
}
