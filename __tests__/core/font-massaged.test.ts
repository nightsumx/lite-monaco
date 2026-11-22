// 写进 CSS 的字体族要带平台默认栈(Monaco getMassagedFontFamily):用户字体没有的字形(阿拉伯文、CJK)走这条栈回退。
// Firefox 里漏掉它,阿拉伯文按系统回退字体比例排版,宽度与 Monaco 差 14px(browser-diff 97-engines/rtl-selection-mark-boundary)。
import { describe, expect, it } from 'vitest'
import { massagedFontFamily } from '../../src/core/options/fontclasses'
import { defaultsFor } from '../../src/core/options/validate'
import { keyOS } from '../../src/core/keyos'
import { cleanup, mountEditor } from './h2-helpers'
import { afterEach } from 'vitest'
afterEach(cleanup)

const dflt = defaultsFor(keyOS).fontFamily as string

describe('massagedFontFamily', () => {
    it('默认栈原样;其他族后面追加默认栈', () => {
        expect(massagedFontFamily(dflt)).toBe(dflt)
        expect(massagedFontFamily('Foo')).toBe(`Foo, ${dflt}`)
    })
    it('带空格 / + 的单个族名加引号;已经带逗号或引号的不动', () => {
        expect(massagedFontFamily('Fira Code')).toBe(`"Fira Code", ${dflt}`)
        expect(massagedFontFamily('Menlo, monospace')).toBe(`Menlo, monospace, ${dflt}`)
        expect(massagedFontFamily('"A B"')).toBe(`"A B", ${dflt}`)
    })
    it('applyFontInfo 写到目标元素的 font-family 带默认栈', () => {
        const ed = mountEditor('a', { options: { fontFamily: 'Foo' } })
        const el = document.createElement('div')
        ed.applyFontInfo(el)
        expect(el.style.fontFamily).toBe(`Foo, ${dflt}`.replace(/'/g, '"'))
    })
})
