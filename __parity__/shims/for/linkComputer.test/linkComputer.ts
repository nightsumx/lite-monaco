// Monaco computeLinks(target) → lite-monaco core/feature/link 的 computeLineLinks(line)(逐行,偏移相对行首)。
import { computeLineLinks } from '../../../../src/core/feature/link'

export interface ILinkComputerTarget {
    getLineCount(): number
    getLineContent(lineNumber: number): string
}

export function computeLinks(model: ILinkComputerTarget | null) {
    const result: { range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }, url: string }[] = []
    if (!model) return result
    for (let n = 1; n <= model.getLineCount(); n++)
        for (const l of computeLineLinks(model.getLineContent(n)))
            result.push({ range: { startLineNumber: n, startColumn: l.from + 1, endLineNumber: n, endColumn: l.to + 1 }, url: l.url })
    return result
}
