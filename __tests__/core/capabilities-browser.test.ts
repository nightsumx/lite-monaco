// 能力 H9: browser 检测字段完整（对齐 CM6）
import { describe, expect, it } from 'vitest'
import { browser } from '../../src/core/browser'
import { editContextSupported } from '../../src/core/input/editcontext'

describe('browser 检测面', () => {
    it('必备平台/引擎字段存在且类型正确', () => {
        expect(typeof browser.mac).toBe('boolean')
        expect(typeof browser.windows).toBe('boolean')
        expect(typeof browser.linux).toBe('boolean')
        expect(typeof browser.ios).toBe('boolean')
        expect(typeof browser.android).toBe('boolean')
        expect(typeof browser.chrome).toBe('boolean')
        expect(typeof browser.safari).toBe('boolean')
        expect(typeof browser.gecko).toBe('boolean')
        expect(typeof browser.webkit).toBe('boolean')
        expect(typeof browser.ie).toBe('boolean')
        expect(typeof browser.chrome_version).toBe('number')
        expect(typeof browser.safari_version).toBe('number')
        expect(typeof browser.gecko_version).toBe('number')
        expect(typeof browser.webkit_version).toBe('number')
        expect(typeof browser.ie_version).toBe('number')
        expect(typeof browser.tabSize).toBe('string')
    })

    it('chrome 与 ie 互斥（常见桌面）', () => {
        if (browser.chrome) expect(browser.ie).toBe(false)
    })

    it('ios 蕴含 mac（CM6 语义）', () => {
        if (browser.ios) expect(browser.mac).toBe(true)
    })

    it('tabSize 属性名合法', () => {
        expect(browser.tabSize === 'tab-size' || browser.tabSize === '-moz-tab-size').toBe(true)
    })

    it('jsdom 非 Android Chrome≥126：EditContext 关闭', () => {
        expect(editContextSupported()).toBe(false)
    })
})
