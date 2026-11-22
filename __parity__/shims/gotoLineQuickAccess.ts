// Monaco 的 AbstractGotoLineQuickAccessProvider:parsePosition 翻译到 lite-monaco core 的 parseGotoPosition。
// 被测行为(解析 / clamp / 偏移模式)在 src/core/feature/gotoline.ts;这里只做形状转换。
import { parseGotoPosition } from '../../src/core/feature/gotoline'

export class AbstractGotoLineQuickAccessProvider {
    protected storageService: { getBoolean(...a: unknown[]): boolean } = { getBoolean: () => false }
    protected parsePosition(editor: any, value: string) {
        const r = parseGotoPosition(editor.state, value, this.storageService.getBoolean('gotoLine.useZeroBasedOffset'))
        return { inOffsetMode: r.inOffsetMode, lineNumber: r.line, column: r.column, label: r.label }
    }
}
