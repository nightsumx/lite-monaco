// node gl.mjs <result后缀>:打印字形位置(glyphs)不同的行,Monaco / lite 各一行(调试用)
import { readFileSync } from 'node:fs'
const r = JSON.parse(readFileSync(`out/result${process.argv[2]}.json`, 'utf8'))
for (const s of r) {
    if (!s.diffs.length) continue
    console.log('##', s.name)
    for (const [lab, m] of Object.entries(s.snaps.monaco)) {
        const l = s.snaps.lite[lab]; if (!m?.glyphs) continue
        for (const ln of Object.keys(m.glyphs)) {
            const a = m.glyphs[ln], b = l.glyphs[ln]
            if (JSON.stringify(a) !== JSON.stringify(b)) console.log(' line', ln, '\n  M', a?.map(x => x[0] + x[1]).join(' '), '\n  L', b?.map(x => x[0] + x[1]).join(' '))
        }
    }
}
