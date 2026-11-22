// 键位平台(叶子模块,不依赖任何东西):Monaco 的 OS 三分 —— Macintosh / Windows / Linux(其余都算 Linux,
// 见 base/common/platform.js:OS = isMacintosh || isIOS ? Macintosh : isWindows ? Windows : Linux)。
// 默认键位按它分(kbOpts 的 mac / win / linux 字段);Monaco 看 userAgent,我们沿用 navigator.platform。
// 模块加载时定平台(同 keymap / commandpalette);测试改 navigator.platform 后要重新加载模块。

export type KeyOS = 'mac' | 'win' | 'linux'

export function detectKeyOS(platform: string = typeof navigator !== 'undefined' ? navigator.platform : ''): KeyOS {
    if (/Mac|iPhone|iPad/.test(platform)) return 'mac'
    if (/Win/.test(platform)) return 'win'
    return 'linux'
}

export const keyOS: KeyOS = detectKeyOS()
