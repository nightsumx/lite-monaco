// Monaco defaultDocumentColorsComputer(移植):任何语言里的 #hex / rgb() / rgba() / hsl() / hsla() 字面量 → 颜色。
// 与 hexcolor.ts 的 findHexColors 不同的是这里是 Monaco 的严格口径:hex 只认行首或紧跟引号/空白的,
// rgb 分量 0..255、alpha 0..1,hsl 的 h 0..360、s/l 0..100%,不合法的整条丢弃。
// 纯文本 → 区间,不碰 doc / view。

export interface DocColor {
    from: number
    to: number
    /** Monaco IColor:分量都在 0..1 */
    color: { red: number, green: number, blue: number, alpha: number }
}

const INITIAL = /\b(rgb|rgba|hsl|hsla)(\([0-9\s,.\%]*\))|^(#)([A-Fa-f0-9]{3})\b|^(#)([A-Fa-f0-9]{4})\b|^(#)([A-Fa-f0-9]{6})\b|^(#)([A-Fa-f0-9]{8})\b|(?<=['"\s])(#)([A-Fa-f0-9]{3})\b|(?<=['"\s])(#)([A-Fa-f0-9]{4})\b|(?<=['"\s])(#)([A-Fa-f0-9]{6})\b|(?<=['"\s])(#)([A-Fa-f0-9]{8})\b/gm

const BYTE = '(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])'
const HUE = '((?:360(?:\\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\\.\\d+)?))'
const PCT = '(100|\\d{1,2}[.]\\d*|\\d{1,2})%'
const RGB = new RegExp(`^\\(\\s*${BYTE}\\s*,\\s*${BYTE}\\s*,\\s*${BYTE}\\s*\\)$`)
const RGBA = new RegExp(`^\\(\\s*${BYTE}\\s*,\\s*${BYTE}\\s*,\\s*${BYTE}\\s*,\\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\\s*\\)$`)
const HSL = new RegExp(`^\\(\\s*${HUE}\\s*[\\s,]\\s*${PCT}\\s*[\\s,]\\s*${PCT}\\s*\\)$`)
const HSLA = new RegExp(`^\\(\\s*${HUE}\\s*[\\s,]\\s*${PCT}\\s*[\\s,]\\s*${PCT}\\s*[\\s,]\\s*(0[.][0-9]+|[.][0-9]+|[01][.]0*|[01])\\s*\\)$`)

function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
}

/** h:度,s / l:0..1 → 0..255 整数分量 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h /= 360
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    return [Math.round(255 * hue2rgb(p, q, h + 1 / 3)), Math.round(255 * hue2rgb(p, q, h)), Math.round(255 * hue2rgb(p, q, h - 1 / 3))]
}

/** '#rgb' | '#rgba' | '#rrggbb' | '#rrggbbaa' → 0..255 整数分量 + alpha 0..1;不合法 null */
export function parseHexColor(hex: string): { r: number, g: number, b: number, a: number } | null {
    if (!/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null
    const h = hex.slice(1)
    const n = (s: string) => parseInt(s, 16)
    switch (h.length) {
        case 3: return { r: n(h[0] + h[0]), g: n(h[1] + h[1]), b: n(h[2] + h[2]), a: 1 }
        case 4: return { r: n(h[0] + h[0]), g: n(h[1] + h[1]), b: n(h[2] + h[2]), a: n(h[3] + h[3]) / 255 }
        case 6: return { r: n(h.slice(0, 2)), g: n(h.slice(2, 4)), b: n(h.slice(4, 6)), a: 1 }
        default: return { r: n(h.slice(0, 2)), g: n(h.slice(2, 4)), b: n(h.slice(4, 6)), a: n(h.slice(6, 8)) / 255 }
    }
}

const color = (r: number, g: number, b: number, a: number) => ({ red: r / 255, green: g / 255, blue: b / 255, alpha: a })

function fromFunction(scheme: string, params: string): DocColor['color'] | null {
    const re = scheme === 'rgb' ? RGB : scheme === 'rgba' ? RGBA : scheme === 'hsl' ? HSL : HSLA
    const m = re.exec(params)
    if (!m) return null
    const v = m.slice(1).map(Number)
    if (scheme === 'rgb') return color(v[0], v[1], v[2], 1)
    if (scheme === 'rgba') return color(v[0], v[1], v[2], v[3])
    const [r, g, b] = hslToRgb(v[0], v[1] / 100, v[2] / 100)
    return color(r, g, b, scheme === 'hsla' ? v[3] : 1)
}

/** 文本里所有 Monaco 认的颜色字面量,按出现顺序 */
export function computeDefaultDocumentColors(text: string): DocColor[] {
    const out: DocColor[] = []
    for (const m of text.matchAll(INITIAL)) {
        const groups = m.slice(1).filter(g => g !== undefined)
        const scheme = groups[0], params = groups[1]
        if (!params || m.index === undefined) continue
        let c: DocColor['color'] | null
        if (scheme === '#') {
            const p = parseHexColor('#' + params)
            c = p && color(p.r, p.g, p.b, p.a)
        } else c = fromFunction(scheme, params)
        if (c) out.push({ from: m.index, to: m.index + m[0].length, color: c })
    }
    return out
}
