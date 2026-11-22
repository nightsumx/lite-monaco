// Monaco MinimapCharRendererFactory.createFromSampleData → lite-monaco core/chrome/minimapcore 的
// glyphInkFromSample(下采样 + soften)+ glyphIndex(字符 → 格号)+ blendInk(前景叠到不透明底上)。
// renderChar 只是把 lite 小地图 paintLine 里「逐像素取墨量 → blendInk」那段摆进一个 ImageData;
// 底色 alpha 恒 255 时 blendInk 的 source-over 等于 bg + (fg − bg)·墨量/255。
import { glyphInkFromSample, glyphIndex, blendInk } from '../../../../src/core/chrome/minimapcore'

interface RGBA8 { r: number, g: number, b: number, a: number }

export const MinimapCharRendererFactory = {
    createFromSampleData(sample: Uint8ClampedArray, scale: number) {
        const normal = glyphInkFromSample(sample, scale, false)
        const light = glyphInkFromSample(sample, scale, true)
        return {
            renderChar(target: ImageData, dx: number, dy: number, chCode: number, color: RGBA8, foregroundAlpha: number,
                _bg: RGBA8, _bgAlpha: number, fontScale: number, useLighterFont: boolean, force1pxHeight: boolean) {
                const g = useLighterFont ? light : normal
                const cell = glyphIndex(chCode, fontScale)
                const h = force1pxHeight ? 1 : g.ch
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < g.cw; x++) {
                        const a = cell < 0 ? 0 : (g.ink[cell * g.ch * g.cw + y * g.cw + x] * foregroundAlpha) / 255
                        blendInk(target.data as unknown as Uint8ClampedArray, ((dy + y) * target.width + dx + x) * 4, color.r, color.g, color.b, a)
                    }
                }
            },
        }
    },
}
