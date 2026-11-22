// Monaco findSectionHeaders(model, options) → lite-monaco core/chrome/sectionheaders 的 findSectionHeaders(lines, opts)。
// 只做形状翻译:ISectionHeaderFinderTarget → 行表,SectionHeader.line/endLine → IRange。
import { findSectionHeaders as lmFindSectionHeaders } from '../../../../src/core/chrome/sectionheaders'

export interface ISectionHeaderFinderTarget {
    getLineCount(): number
    getLineContent(lineNumber: number): string
}

export interface FindSectionHeaderOptions {
    foldingRules?: { markers?: { start: RegExp, end: RegExp } }
    findRegionSectionHeaders: boolean
    findMarkSectionHeaders: boolean
    markSectionHeaderRegex: string
}

export interface SectionHeader {
    range: { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }
    text: string
    hasSeparatorLine: boolean
    shouldBeInComments: boolean
}

export function findSectionHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
    const lines: string[] = []
    for (let n = 1; n <= model.getLineCount(); n++) lines.push(model.getLineContent(n))
    const m = options.foldingRules?.markers
    return lmFindSectionHeaders(lines, {
        region: options.findRegionSectionHeaders,
        mark: options.findMarkSectionHeaders,
        markers: m ? { start: [], end: [], regex: m } : null,
        markRegex: options.markSectionHeaderRegex,
    }).map(h => ({
        range: { startLineNumber: h.line, startColumn: h.startColumn, endLineNumber: h.endLine, endColumn: h.endColumn },
        text: h.text, hasSeparatorLine: h.hasSeparatorLine, shouldBeInComments: h.shouldBeInComments,
    }))
}
