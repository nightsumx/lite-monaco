// 纯字符串 ↔ (line, column) 换算(Monaco PositionOffsetTransformer)。
// 与 model.getOffsetAt/getPositionAt 的区别:那两个钳位到文档;这里 offset 越界时外推(最后一行往右数),
// 因为调用方手里是一段 TS 语言服务/正则给的字符串 offset,不一定落在文本内。Position → offset 仍然钳位。
// 行分隔只认 \n;行尾的 \r 不算行内容(getLineLength 不含它),但 offset 照常占位。

export interface PO { lineNumber: number, column: number }
export interface PORange { startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number }

export class PositionOffsetTransformer {
    private readonly starts: number[] = [0]
    private readonly ends: number[] = []

    constructor(readonly text: string) {
        for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
            this.starts.push(i + 1)
            this.ends.push(i > 0 && text.charCodeAt(i - 1) === 13 ? i - 1 : i)
        }
        this.ends.push(text.length)
    }

    get lineCount(): number { return this.starts.length }

    getLineLength(lineNumber: number): number { return this.ends[lineNumber - 1] - this.starts[lineNumber - 1] }

    /** 钳位:越界的 line/column 落到最近的合法位置 */
    getOffset(p: PO): number {
        const line = Math.max(1, Math.min(p.lineNumber, this.starts.length))
        if (p.lineNumber < 1) return 0
        if (p.lineNumber > this.starts.length) return this.starts[line - 1] + this.getLineLength(line)
        return this.starts[line - 1] + Math.max(0, Math.min(p.column - 1, this.getLineLength(line)))
    }

    /** 不钳位:offset > text.length 时在最后一行继续往右数;offset < 0 落在 (1, 1 + offset) */
    getPosition(offset: number): PO {
        let lo = 0, hi = this.starts.length - 1
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (this.starts[mid] <= offset) lo = mid
            else hi = mid - 1
        }
        return { lineNumber: lo + 1, column: offset - this.starts[lo] + 1 }
    }

    getOffsetRange(r: PORange): { start: number, endExclusive: number } {
        return {
            start: this.getOffset({ lineNumber: r.startLineNumber, column: r.startColumn }),
            endExclusive: this.getOffset({ lineNumber: r.endLineNumber, column: r.endColumn }),
        }
    }

    getRange(start: number, endExclusive: number): PORange {
        const a = this.getPosition(start), b = this.getPosition(endExclusive)
        return { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }
    }
}
