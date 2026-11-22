// Portions of this file are derived from CodeMirror 6 (MIT, Copyright (C) Marijn Haverbeke and others). See THIRD-PARTY-NOTICES.md.
// CM7 浏览器检测 —— 沼泽化石前置条件。逐字段对齐 codeSrc/view/src/browser.ts。
// 版本号/平台细粒度直接影响 iOS pending key、Android GBoard、Safari composition 等分支。

const nav: { userAgent: string, vendor: string, platform: string, maxTouchPoints?: number } =
    typeof navigator !== 'undefined'
        ? navigator as { userAgent: string, vendor: string, platform: string, maxTouchPoints?: number }
        : { userAgent: '', vendor: '', platform: '' }
const docEl: { style: Record<string, unknown>, documentMode?: number } =
    typeof document !== 'undefined'
        ? document.documentElement as unknown as { style: Record<string, unknown>, documentMode?: number }
        : { style: {} }
const docMode = typeof document !== 'undefined'
    ? (document as Document & { documentMode?: number }).documentMode
    : undefined

const ie_edge = /Edge\/(\d+)/.exec(nav.userAgent)
const ie_upto10 = /MSIE \d/.test(nav.userAgent)
const ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(nav.userAgent)
const ie = !!(ie_upto10 || ie_11up || ie_edge)
const gecko = !ie && /gecko\/(\d+)/i.test(nav.userAgent)
const chrome = !ie && /Chrome\/(\d+)/.exec(nav.userAgent)
const webkit = 'webkitFontSmoothing' in docEl.style
const safari = !ie && /Apple Computer/.test(nav.vendor)
// iPadOS 桌面 UA 无 Mobile/：用 maxTouchPoints>2 识别（CM6 同款）
const ios = safari && (/Mobile\/\w+/.test(nav.userAgent) || (nav.maxTouchPoints ?? 0) > 2)

export const browser = {
    mac: ios || /Mac/.test(nav.platform),
    windows: /Win/.test(nav.platform),
    linux: /Linux|X11/.test(nav.platform),
    ie,
    ie_version: ie_upto10 ? (docMode || 6) : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0,
    gecko,
    gecko_version: gecko ? +(/Firefox\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    chrome: !!chrome,
    chrome_version: chrome ? +chrome[1] : 0,
    ios,
    android: /Android\b/.test(nav.userAgent),
    webkit,
    webkit_version: webkit ? +(/\bAppleWebKit\/(\d+)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    safari,
    safari_version: safari ? +(/\bVersion\/(\d+(\.\d+)?)/.exec(nav.userAgent) || [0, 0])[1] : 0,
    tabSize: docEl.style.tabSize != null ? 'tab-size' : '-moz-tab-size',
}

export default browser
