// Monaco computeDefaultDocumentColors(model) → lite-monaco core/feature/doccolors 的 computeDefaultDocumentColors(text)
// 只做 offset → Monaco IRange 的换算(单行字面量:起止同行)。
import { computeDefaultDocumentColors as compute } from '../../../../src/core/feature/doccolors'

interface Target { getValue(): string, positionAt(offset: number): { lineNumber: number, column: number } }

export function computeDefaultDocumentColors(model: Target) {
    if (!model || typeof model.getValue !== 'function' || typeof model.positionAt !== 'function') return []
    return compute(model.getValue()).map(c => {
        const s = model.positionAt(c.from)
        return {
            range: { startLineNumber: s.lineNumber, startColumn: s.column, endLineNumber: s.lineNumber, endColumn: s.column + (c.to - c.from) },
            color: c.color,
        }
    })
}
