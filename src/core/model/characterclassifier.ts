// 字符分类表(Monaco CharacterClassifier / CharacterSet):charCode → 小整数(0..255)。
// 0..255 走定长 Uint8Array(代码里绝大多数字符),其余落稀疏 Map;没设过的返回默认值。

const toUint8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0)

export class CharacterClassifier<T extends number> {
    private readonly asciiMap = new Uint8Array(256)
    private readonly map = new Map<number, number>()
    private readonly defaultValue: number

    constructor(defaultValue: T) {
        this.defaultValue = toUint8(defaultValue)
        this.asciiMap.fill(this.defaultValue)
    }

    set(charCode: number, value: T): void {
        const v = toUint8(value)
        if (charCode >= 0 && charCode < 256) this.asciiMap[charCode] = v
        else this.map.set(charCode, v)
    }

    get(charCode: number): T {
        if (charCode >= 0 && charCode < 256) return this.asciiMap[charCode] as T
        return (this.map.get(charCode) || this.defaultValue) as T
    }

    clear(): void {
        this.asciiMap.fill(this.defaultValue)
        this.map.clear()
    }
}

export class CharacterSet {
    private readonly actual = new CharacterClassifier<0 | 1>(0)
    add(charCode: number): void { this.actual.set(charCode, 1) }
    has(charCode: number): boolean { return this.actual.get(charCode) === 1 }
    clear(): void { this.actual.clear() }
}
