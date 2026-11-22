// Monaco 的 KeyCode / KeyMod(数值与 monaco.d.ts 的公共枚举一致)和浏览器键盘事件 → KeyCode 的换算。
// 用于 IKeyboardEvent、addCommand / addKeybindingRule 这类要数字键位的 API。
// 注意 lite-monaco 自己的键位表用字符串("Mod-s"),这里只是 Monaco 形态的外壳。

import { keyOS } from '../core/keyos'

/** Monaco KeyCode */
export enum KeyCode {
    DependsOnKbLayout = -1,
    Unknown = 0,
    Backspace = 1,
    Tab = 2,
    Enter = 3,
    Shift = 4,
    Ctrl = 5,
    Alt = 6,
    PauseBreak = 7,
    CapsLock = 8,
    Escape = 9,
    Space = 10,
    PageUp = 11,
    PageDown = 12,
    End = 13,
    Home = 14,
    LeftArrow = 15,
    UpArrow = 16,
    RightArrow = 17,
    DownArrow = 18,
    Insert = 19,
    Delete = 20,
    Digit0 = 21,
    Digit1 = 22,
    Digit2 = 23,
    Digit3 = 24,
    Digit4 = 25,
    Digit5 = 26,
    Digit6 = 27,
    Digit7 = 28,
    Digit8 = 29,
    Digit9 = 30,
    KeyA = 31,
    KeyB = 32,
    KeyC = 33,
    KeyD = 34,
    KeyE = 35,
    KeyF = 36,
    KeyG = 37,
    KeyH = 38,
    KeyI = 39,
    KeyJ = 40,
    KeyK = 41,
    KeyL = 42,
    KeyM = 43,
    KeyN = 44,
    KeyO = 45,
    KeyP = 46,
    KeyQ = 47,
    KeyR = 48,
    KeyS = 49,
    KeyT = 50,
    KeyU = 51,
    KeyV = 52,
    KeyW = 53,
    KeyX = 54,
    KeyY = 55,
    KeyZ = 56,
    Meta = 57,
    ContextMenu = 58,
    F1 = 59,
    F2 = 60,
    F3 = 61,
    F4 = 62,
    F5 = 63,
    F6 = 64,
    F7 = 65,
    F8 = 66,
    F9 = 67,
    F10 = 68,
    F11 = 69,
    F12 = 70,
    F13 = 71,
    F14 = 72,
    F15 = 73,
    F16 = 74,
    F17 = 75,
    F18 = 76,
    F19 = 77,
    F20 = 78,
    F21 = 79,
    F22 = 80,
    F23 = 81,
    F24 = 82,
    NumLock = 83,
    ScrollLock = 84,
    Semicolon = 85,
    Equal = 86,
    Comma = 87,
    Minus = 88,
    Period = 89,
    Slash = 90,
    Backquote = 91,
    BracketLeft = 92,
    Backslash = 93,
    BracketRight = 94,
    Quote = 95,
    OEM_8 = 96,
    IntlBackslash = 97,
    Numpad0 = 98,
    Numpad1 = 99,
    Numpad2 = 100,
    Numpad3 = 101,
    Numpad4 = 102,
    Numpad5 = 103,
    Numpad6 = 104,
    Numpad7 = 105,
    Numpad8 = 106,
    Numpad9 = 107,
    NumpadMultiply = 108,
    NumpadAdd = 109,
    NUMPAD_SEPARATOR = 110,
    NumpadSubtract = 111,
    NumpadDecimal = 112,
    NumpadDivide = 113,
    KEY_IN_COMPOSITION = 114,
    ABNT_C1 = 115,
    ABNT_C2 = 116,
    AudioVolumeMute = 117,
    AudioVolumeUp = 118,
    AudioVolumeDown = 119,
    BrowserSearch = 120,
    BrowserHome = 121,
    BrowserBack = 122,
    BrowserForward = 123,
    MediaTrackNext = 124,
    MediaTrackPrevious = 125,
    MediaStop = 126,
    MediaPlayPause = 127,
    LaunchMediaPlayer = 128,
    LaunchMail = 129,
    LaunchApp2 = 130,
    Clear = 131,
    MAX_VALUE = 132,
}

/** Monaco KeyMod:CtrlCmd 在 Mac 是 ⌘,其余平台是 Ctrl(数值同 Monaco:2048 / 1024 / 512 / 256) */
export class KeyMod {
    static readonly CtrlCmd: number = 1 << 11
    static readonly Shift: number = 1 << 10
    static readonly Alt: number = 1 << 9
    static readonly WinCtrl: number = 1 << 8
    /** 和弦:第一段在低 16 位,第二段在高 16 位(Monaco KeyChord) */
    static chord(firstPart: number, secondPart: number): number {
        return (firstPart | ((secondPart & 0x0000FFFF) << 16)) >>> 0
    }
}

/** 浏览器 keyCode(旧版,各引擎在 ;=- 和 Meta 上有差异)→ Monaco KeyCode */
const LEGACY: Record<number, KeyCode> = {
    8: KeyCode.Backspace, 9: KeyCode.Tab, 13: KeyCode.Enter, 16: KeyCode.Shift, 17: KeyCode.Ctrl, 18: KeyCode.Alt,
    19: KeyCode.PauseBreak, 20: KeyCode.CapsLock, 27: KeyCode.Escape, 32: KeyCode.Space, 33: KeyCode.PageUp, 34: KeyCode.PageDown,
    35: KeyCode.End, 36: KeyCode.Home, 37: KeyCode.LeftArrow, 38: KeyCode.UpArrow, 39: KeyCode.RightArrow, 40: KeyCode.DownArrow,
    45: KeyCode.Insert, 46: KeyCode.Delete, 91: KeyCode.Meta, 92: KeyCode.Meta, 93: KeyCode.ContextMenu, 224: KeyCode.Meta,
    144: KeyCode.NumLock, 145: KeyCode.ScrollLock,
    186: KeyCode.Semicolon, 59: KeyCode.Semicolon, 187: KeyCode.Equal, 61: KeyCode.Equal, 188: KeyCode.Comma,
    189: KeyCode.Minus, 173: KeyCode.Minus, 190: KeyCode.Period, 191: KeyCode.Slash, 192: KeyCode.Backquote,
    219: KeyCode.BracketLeft, 220: KeyCode.Backslash, 221: KeyCode.BracketRight, 222: KeyCode.Quote, 226: KeyCode.IntlBackslash,
    229: KeyCode.KEY_IN_COMPOSITION,
}
for (let i = 0; i < 10; i++) LEGACY[48 + i] = KeyCode.Digit0 + i
for (let i = 0; i < 26; i++) LEGACY[65 + i] = KeyCode.KeyA + i
for (let i = 0; i < 24; i++) LEGACY[112 + i] = KeyCode.F1 + i
for (let i = 0; i < 10; i++) LEGACY[96 + i] = KeyCode.Numpad0 + i
LEGACY[106] = KeyCode.NumpadMultiply; LEGACY[107] = KeyCode.NumpadAdd; LEGACY[108] = KeyCode.NUMPAD_SEPARATOR
LEGACY[109] = KeyCode.NumpadSubtract; LEGACY[110] = KeyCode.NumpadDecimal; LEGACY[111] = KeyCode.NumpadDivide

/** 键盘事件 → Monaco KeyCode(读 keyCode;不认识的是 Unknown) */
export function keyCodeFromEvent(e: { keyCode: number }): KeyCode {
    return LEGACY[e.keyCode] ?? KeyCode.Unknown
}

/** 事件上的修饰键 → KeyMod 位(CtrlCmd:Mac 看 ⌘,其余看 Ctrl;WinCtrl:Mac 看 ⌃,其余看 Win/Meta) */
export function modifiersFromEvent(e: { ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean }): number {
    const mac = keyOS === 'mac'
    let m = 0
    if (mac ? e.metaKey : e.ctrlKey) m |= KeyMod.CtrlCmd
    if (e.shiftKey) m |= KeyMod.Shift
    if (e.altKey) m |= KeyMod.Alt
    if (mac ? e.ctrlKey : e.metaKey) m |= KeyMod.WinCtrl
    return m
}
