// CM7 keymap —— KeyBinding → keydown 接线。阶段4 视图接入。映射 _cmsrc view/keymap.ts 精简版。
//
// CM6 keymap 有多键和弦(prefix chord)、scope、platform 规整、w3c-keyname 依赖。CM7 取切片:
// key→command 表,按 KeyboardEvent 的 modifier + key 直配;带 Alt/Cmd/Ctrl 时 event.key 配不上再按
// 物理键(event.code / keyCode,等价 w3c-keyname 的 base 表)配;空格分隔的和弦("Mod-k Mod-d")。
// 砍:scope。"Mod-" 占位按平台解析(navigator.platform,或 keymapHandler 的 mac 选项)。
//
// KeyBinding.key 形如 "Mod-a"、"ArrowLeft"、"Shift-ArrowRight"、"Backspace"、"Mod-k Mod-d";run 是 StateCommand。
// shift 可单列(给 Shift+同键的扩选命令)。preventDefault 默认 true(命令处理了就不让浏览器再动)。

import type { EditorState, StateCommand, Transaction } from '../model/state'
import {
    addCursorAbove,
    addCursorBelow,
    cursorColumnSelectLeft, cursorColumnSelectRight, cursorColumnSelectUp, cursorColumnSelectDown, cursorColumnSelectPageUp, cursorColumnSelectPageDown,
    copyLineDown,
    copyLineUp,
    cursorCharLeft,
    cursorCharRight,
    cursorDocEnd,
    cursorDocStart,
    cursorLineStart,
    deleteAllLeft,
    deleteToLineStart,
    deleteWordPartBackward,
    deleteWordPartForward,
    deleteAllRight,
    joinLines,
    moveSelectionToNextFindMatch,
    selectLineStart,
    splitLine,
    transposeLetters,
    cursorSubwordBackward,
    cursorSubwordForward,
    cursorWordEndRight,
    cursorWordLeft,
    cursorLineBoundaryBackward,
    cursorLineBoundaryForward,
    cursorLineDown,
    cursorLineEnd,
    cursorLineUp,
    deleteCharBackward,
    deleteCharForward,
    deleteGroupBackward,
    deleteGroupForward,
    deleteLine,
    cursorMatchingBracket,
    cursorPageDown,
    cursorPageUp,
    scrollLineDown,
    scrollLineUp,
    scrollPageDown,
    scrollPageUp,
    indentLess,
    indentMore,
    insertNewlineAndIndent,
    insertLineAfter,
    insertLineBefore,
    insertCursorAtEndOfEachLineSelected,
    insertTab,
    moveLineDown,
    moveLineUp,
    selectAll,
    selectCharLeft,
    selectCharRight,
    selectDocEnd,
    selectDocStart,
    selectSubwordBackward,
    selectSubwordForward,
    selectWordEndRight,
    selectWordLeft,
    selectLine,
    selectLineBoundaryBackward,
    selectLineBoundaryForward,
    selectLineDown,
    selectLineEnd,
    selectLineUp,
    selectNextOccurrence,
    selectAllOccurrences,
    selectPageDown,
    selectPageUp,
    simplifySelection,
} from './commands'
import { cursorUndo, redo, undo } from './history'
import { inPlaceReplaceDown, inPlaceReplaceUp } from './inplace'
import { copyCommand, cutCommand } from '../input/clipboard'
import { keyOS, type KeyOS } from '../keyos'
import { boolOption } from './editoptions'

export interface KeyBinding {
    key: string
    run: StateCommand
    shift?: StateCommand
    preventDefault?: boolean
}

// keydown 处理器需要的最小目标:state + dispatch(EditorView 满足)。
export interface KeymapTarget {
    state: EditorState
    dispatch: (tr: Transaction) => void
}

const isMacPlatform = keyOS === 'mac'

export interface KeymapOptions {
    // 平台。缺省按 navigator.platform;jsdom 测试可显式要 Mac 键位。
    mac?: boolean
    // 命中的导航键命令返 false 时也吞掉(护 contenteditable,见 isClaimed)。浮层输入框里传 false,落回原生
    claim?: boolean
}

interface Stroke { base: string, ctrl: boolean, alt: boolean, shift: boolean, meta: boolean }

// 把 "Shift-Mod-ArrowLeft" 拆成 { ctrl, alt, shift, meta, base }。
function parseStroke(key: string, mac: boolean): Stroke {
    // 末段是 "-" 本身时(如 "Mod--")split 会出空串,按字面 "-" 处理
    const parts = key.split('-')
    let base = parts[parts.length - 1]
    let n = parts.length - 1
    if (base === '' && n > 0) { base = '-'; n-- }
    let ctrl = false, alt = false, shift = false, meta = false
    for (let i = 0; i < n; i++) {
        const m = parts[i]
        if (m === 'Mod') (mac ? meta = true : ctrl = true)
        else if (m === 'Ctrl' || m === 'Control') ctrl = true
        else if (m === 'Alt') alt = true
        else if (m === 'Shift') shift = true
        else if (m === 'Meta' || m === 'Cmd') meta = true
    }
    return { base, ctrl, alt, shift, meta }
}

// 和弦:"Mod-k Mod-d" 空格分隔多段(对齐 CM6 / Monaco chord)。
function parseKey(key: string, mac: boolean): Stroke[] {
    return key.split(' ').filter(Boolean).map(k => parseStroke(k, mac))
}

// 事件的 base key 是否匹配绑定 base(单字符比较忽略大小写,因 Shift 已单独判)。
// "Space"/"Tab"/"Enter" 等命名键映射到 event.key 的单字符值。
const KEY_NAME_MAP: Record<string, string> = {
    Space: ' ', Tab: 'Tab', Enter: 'Enter',
}
function baseMatches(eventKey: string, base: string) {
    const mapped = KEY_NAME_MAP[base] ?? base
    if (mapped.length === 1 && eventKey.length === 1)
        return eventKey.toLowerCase() === mapped.toLowerCase()
    return eventKey === mapped
}

// 物理键 → 美式布局下的 base 字符(对齐 w3c-keyname 的 base 表)。Mac 上 ⌥ 会改 event.key
// (⌥⇧I → 'ˆ'、⌥A → 'å'),⇧ 会把 \ 变 '|';带 Alt/Cmd/Ctrl 时按物理键再配一次。
const CODE_BASE: Record<string, string> = {
    Backslash: '\\', BracketLeft: '[', BracketRight: ']', Slash: '/', Period: '.', Comma: ',',
    Semicolon: ';', Quote: '\'', Minus: '-', Equal: '=', Backquote: '`', Space: ' ',
}
const KEYCODE_BASE: Record<number, string> = {
    220: '\\', 219: '[', 221: ']', 191: '/', 190: '.', 188: ',', 186: ';', 222: '\'', 189: '-', 187: '=', 192: '`', 32: ' ',
}
function physicalBase(event: KeyboardEvent): string | null {
    const code = event.code
    if (code) {
        if (code.length === 4 && code.startsWith('Key')) return code[3].toLowerCase()
        if (code.length === 6 && code.startsWith('Digit')) return code[5]
        if (CODE_BASE[code]) return CODE_BASE[code]
        return null
    }
    const kc = event.keyCode
    if (kc >= 65 && kc <= 90) return String.fromCharCode(kc + 32)
    if (kc >= 48 && kc <= 57) return String.fromCharCode(kc)
    return KEYCODE_BASE[kc] ?? null
}

function strokeMatches(event: KeyboardEvent, p: Stroke, shiftFree: boolean): boolean {
    if (event.ctrlKey !== p.ctrl || event.altKey !== p.alt || event.metaKey !== p.meta)
        return false
    if (!shiftFree && event.shiftKey !== p.shift)
        return false
    if (baseMatches(event.key, p.base))
        return true
    if (event.altKey || event.metaKey || event.ctrlKey) {
        const phys = physicalBase(event)
        if (phys != null && phys !== event.key && baseMatches(phys, p.base))
            return true
    }
    return false
}

// 认领键:绑定命中但命令返 false(到边界、无可动)时也 preventDefault,绝不落原生 contenteditable
// (原生 ⇧End 会把 DOM 选区扩到行外、⌥↑ 会动原生光标等,都破坏 DOM≡doc)。
// 纯 Backspace/Delete 不在内:无修饰的退格/删除在文档首尾原生也无副作用,留给原生(含 IME 场景)。
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
function isClaimed(event: KeyboardEvent): boolean {
    if (NAV_KEYS.has(event.key)) return true
    if ((event.key === 'Backspace' || event.key === 'Delete') && (event.altKey || event.metaKey || event.ctrlKey))
        return true
    return false
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS', 'AltGraph', 'Fn'])

/** 被当成和弦前缀(还要下一段)吞掉的按键。hover 据此不关卡(Monaco softDispatch → MoreChordsNeeded) */
export const chordPrefixKeys = new WeakSet<KeyboardEvent>()

// 由一组 KeyBinding 产生一个 keydown handler:返回 true=已处理(已 preventDefault)。
// 和弦:首段命中某个多段绑定 → 记 pending,吞掉这一键;下一键在 pending 后续里找,找不到也吞
// (对齐 Monaco:⌘K 后按未绑定键提示「不是命令」而不落字)。单纯修饰键按下不打断 pending。
export function keymapHandler(bindings: readonly KeyBinding[], options: KeymapOptions = {}) {
    const mac = options.mac ?? isMacPlatform
    const parsed = bindings.map(b => ({ b, strokes: parseKey(b.key, mac) }))
    let pending: { b: KeyBinding, strokes: Stroke[] }[] | null = null
    let pendingIndex = 0
    return (event: KeyboardEvent, target: KeymapTarget): boolean => {
        // IME 组字中的按键属于输入法,绝不当编辑命令跑:中文拼音里按 Backspace 删拼音码、Space/Enter
        // 选字、方向键翻候选,浏览器都带 isComposing(keyCode 常为 229)。若在此触发 deleteCharBackward/
        // insertNewline 等,会一边组字一边改文档 → 用户报的「打输入法时按键也触发退格,混乱」。
        if (event.isComposing || event.keyCode === 229) return false
        if (pending) {
            if (MODIFIER_KEYS.has(event.key)) return false
            const cands = pending, idx = pendingIndex
            pending = null
            const next = cands.filter(c => strokeMatches(event, c.strokes[idx], false))
            if (next.some(c => c.strokes.length > idx + 1)) {
                pending = next.filter(c => c.strokes.length > idx + 1)
                pendingIndex = idx + 1
                chordPrefixKeys.add(event)
            }
            else {
                for (const { b } of next) {
                    if (b.run(target)) break
                }
            }
            event.preventDefault()
            return true
        }
        let claimed = false
        const chords: { b: KeyBinding, strokes: Stroke[] }[] = []
        for (const entry of parsed) {
            const { b, strokes } = entry
            const p = strokes[0]
            if (strokes.length > 1) {
                if (strokeMatches(event, p, false)) chords.push(entry)
                continue
            }
            // shift:绑定声明了 shift 命令则按 Shift 状态分流;否则要求 shift 状态与绑定一致。
            if (!strokeMatches(event, p, !!b.shift))
                continue
            const cmd = event.shiftKey && b.shift ? b.shift : (event.shiftKey === p.shift ? b.run : null)
            if (!cmd)
                continue
            claimed = true
            const run = event.shiftKey && b.shift && boolOption(target.state, 'columnSelection', false) ? columnSelectCommand(cmd) : cmd
            if (run(target)) {
                if (b.preventDefault !== false)
                    event.preventDefault()
                return true
            }
        }
        if (chords.length) {
            pending = chords
            pendingIndex = 1
            chordPrefixKeys.add(event)
            event.preventDefault()
            return true
        }
        if (claimed && options.claim !== false && isClaimed(event)) {
            event.preventDefault()
            return true
        }
        return false
    }
}

// 选项 columnSelection(默认 false)为 true 时,Shift+方向键 / 翻页走列选命令(Monaco 在 editorColumnSelection 下绑到 cursorColumnSelect*)。
// 在分发处按命令换,不改键位表(键位表里仍是普通扩选命令,命令面板 / 延迟表照旧)。懒建:defaultKeymap 在模块加载时就建,循环引用下 import 可能还没就位。
let columnSelectFor: Map<StateCommand, StateCommand> | undefined
function columnSelectCommand(cmd: StateCommand): StateCommand {
    columnSelectFor ??= new Map<StateCommand, StateCommand>([
        [selectCharLeft, cursorColumnSelectLeft],
        [selectCharRight, cursorColumnSelectRight],
        [selectLineUp, cursorColumnSelectUp],
        [selectLineDown, cursorColumnSelectDown],
        [selectPageUp, cursorColumnSelectPageUp],
        [selectPageDown, cursorColumnSelectPageDown],
    ])
    return columnSelectFor.get(cmd) ?? cmd
}

// 默认键位:对标 Monaco 0.52 默认键位(macOS 以实测为准)。
// 覆盖:方向键(含扩选)、Home/End、词级移动、删词、全选/撤销/重做、行移动/复制、回车、文档首尾、
// Mac 的 emacs 键(⌃A/E/K/H/D/T/P/N/F/B/O/J)、⌘U 光标撤销、⌘K ⌘D 跳过当前匹配。
// 平台照 Monaco kbOpts 三分(mac / win / linux 字段,见 keyos.ts);传 boolean 是旧写法:true = Mac,false = Windows。
export function buildDefaultKeymap(platform: boolean | KeyOS = keyOS): KeyBinding[] {
    const os: KeyOS = platform === true ? 'mac' : platform === false ? 'win' : platform
    const mac = os === 'mac'
    return [
        // 字符级移动 + 扩选
        // Shift+方向键 / 翻页:选项 columnSelection 开着时是列选(Monaco 在 editorColumnSelection 下把这六个键绑到 cursorColumnSelect*)
        { key: 'ArrowLeft', run: cursorCharLeft, shift: selectCharLeft },
        { key: 'ArrowRight', run: cursorCharRight, shift: selectCharRight },
        { key: 'ArrowUp', run: cursorLineUp, shift: selectLineUp },
        { key: 'ArrowDown', run: cursorLineDown, shift: selectLineDown },
        { key: 'Home', run: cursorLineBoundaryBackward, shift: selectLineBoundaryBackward },
        { key: 'End', run: cursorLineBoundaryForward, shift: selectLineBoundaryForward },
        { key: 'PageUp', run: cursorPageUp, shift: selectPageUp },
        { key: 'PageDown', run: cursorPageDown, shift: selectPageDown },
        // 词级移动 / 行首尾 / 文档首尾 —— 平台键位随 Monaco:
        //   Mac:⌥Arrow=词、⌘Arrow=行首尾(smart-home)、⌘↑↓=文档首尾、⌃⌥Arrow=子词。
        //   Win/Linux:Ctrl+Arrow=词、Home/End=行首尾(共用上方基础绑定)、Ctrl+Home/End=文档首尾;子词(cursorWordPartLeft)
        //   Monaco 只给 Mac 绑了键,Win/Linux 没有。
        // 前向词移动落词尾(cursorWordEndRight)、后向落词首(cursorWordLeft),见 commands.ts wordMotion。
        ...(mac ? [
            { key: 'Alt-ArrowLeft', run: cursorWordLeft, shift: selectWordLeft },
            { key: 'Alt-ArrowRight', run: cursorWordEndRight, shift: selectWordEndRight },
            { key: 'Cmd-ArrowLeft', run: cursorLineBoundaryBackward, shift: selectLineBoundaryBackward },
            { key: 'Cmd-ArrowRight', run: cursorLineBoundaryForward, shift: selectLineBoundaryForward },
            { key: 'Cmd-ArrowUp', run: cursorDocStart, shift: selectDocStart },
            { key: 'Cmd-ArrowDown', run: cursorDocEnd, shift: selectDocEnd },
            { key: 'Ctrl-Alt-ArrowLeft', run: cursorSubwordBackward, shift: selectSubwordBackward },
            { key: 'Ctrl-Alt-ArrowRight', run: cursorSubwordForward, shift: selectSubwordForward },
            // ⌃←/⌃→:Monaco 没绑,走 macOS 文本框原生 moveToBeginning/EndOfLine(真行首,不是智能 Home)
            { key: 'Ctrl-ArrowLeft', run: cursorLineStart, shift: selectLineStart },
            { key: 'Ctrl-ArrowRight', run: cursorLineEnd, shift: selectLineEnd },
        ] : [
            { key: 'Ctrl-ArrowLeft', run: cursorWordLeft, shift: selectWordLeft },
            { key: 'Ctrl-ArrowRight', run: cursorWordEndRight, shift: selectWordEndRight },
            { key: 'Ctrl-Home', run: cursorDocStart, shift: selectDocStart },
            { key: 'Ctrl-End', run: cursorDocEnd, shift: selectDocEnd },
        ]),
        // Windows 另有 Ctrl+Shift+↑↓ = cursorUpSelect / cursorDownSelect(Linux 上这组键是加光标,见下)
        ...(os === 'win' ? [
            { key: 'Ctrl-Shift-ArrowUp', run: selectLineUp },
            { key: 'Ctrl-Shift-ArrowDown', run: selectLineDown },
        ] : []),
        // 滚一行 / 一页,光标不动(Monaco scrollLineUp/Down、scrollPageUp/Down):
        //   Mac ⌃PageUp/⌃PageDown、⌘PageUp/⌘PageDown;Win/Linux Ctrl+↑↓、Alt+PageUp/PageDown。
        ...(mac ? [
            { key: 'Ctrl-PageUp', run: scrollLineUp },
            { key: 'Ctrl-PageDown', run: scrollLineDown },
            { key: 'Cmd-PageUp', run: scrollPageUp },
            { key: 'Cmd-PageDown', run: scrollPageDown },
        ] : [
            { key: 'Ctrl-ArrowUp', run: scrollLineUp },
            { key: 'Ctrl-ArrowDown', run: scrollLineDown },
            { key: 'Alt-PageUp', run: scrollPageUp },
            { key: 'Alt-PageDown', run: scrollPageDown },
        ]),
        // 多光标:添加下一匹配;⌘K ⌘D 把最后一个选区挪到下一匹配(和弦)
        { key: 'Mod-d', run: selectNextOccurrence },
        { key: 'Mod-k Mod-d', run: moveSelectionToNextFindMatch },
        { key: 'Mod-Shift-l', run: selectAllOccurrences }, // 对齐 Monaco selectHighlights：全文同串一次多选
        // 删除(Shift 不改语义:Shift+Backspace/Delete 与不带 Shift 同,免落原生绕过模型)
        { key: 'Backspace', run: deleteCharBackward },
        { key: 'Shift-Backspace', run: deleteCharBackward },
        { key: 'Delete', run: deleteCharForward },
        // ⇧Delete:Win/Linux 上是剪切(Monaco 浏览器版没绑剪贴板键,交给 textarea 原生:Blink editing_behavior
        // 的 Shift+Delete = Cut、Ctrl+Insert = Copy、Shift+Insert = Paste);Mac 上 Monaco 不做任何事,
        // 认领并 preventDefault,免得落到 contenteditable 原生删除。
        ...(mac ? [{ key: 'Shift-Delete', run: () => true }] : [
            { key: 'Shift-Delete', run: cutCommand },
            { key: 'Ctrl-Insert', run: copyCommand },
            // ⇧Insert(粘贴)不绑:交给原生 paste 事件(见 Mod-v 处的说明)
        ]),
        // ⇧⌘⌫:空光标删到行首(Monaco 这个键没有命令,是 textarea 原生的删到行首;有选区时原生什么也不删);⇧⌘Delete 不动
        ...(mac ? [
            { key: 'Mod-Shift-Backspace', run: (t: KeymapTarget) => t.state.selection.main.empty ? deleteToLineStart(t) || true : true },
            { key: 'Mod-Shift-Delete', run: () => true },
        ] : []),
        // ⇧⌘, / ⇧⌘.:换成上一个 / 下一个值(Monaco inPlaceReplace)
        { key: 'Mod-Shift-,', run: inPlaceReplaceUp },
        { key: 'Mod-Shift-.', run: inPlaceReplaceDown },
        // 删整行:⇧⌘K。Mac:⌘⌫ deleteAllLeft、⌘Delete deleteAllRight、⌥⌫/⌥Delete 删词;Win/Linux Ctrl+⌫/Del 删词。
        { key: 'Mod-Shift-k', run: deleteLine },
        ...(mac ? [
            { key: 'Cmd-Backspace', run: deleteAllLeft },
            { key: 'Cmd-Delete', run: deleteAllRight },
            { key: 'Alt-Backspace', run: deleteGroupBackward },
            { key: 'Alt-Delete', run: deleteGroupForward },
            // ⌃⌫/⌃Delete 同普通退格/删除;⌃⌥⌫/⌃⌥Delete 删子词(Monaco deleteWordPartLeft/Right)
            { key: 'Ctrl-Backspace', run: deleteCharBackward },
            { key: 'Ctrl-Delete', run: deleteCharForward },
            { key: 'Ctrl-Alt-Backspace', run: deleteWordPartBackward },
            { key: 'Ctrl-Alt-Delete', run: deleteWordPartForward },
            // emacs 键(Monaco macOS 默认)
            { key: 'Ctrl-b', run: cursorCharLeft, shift: selectCharLeft },
            { key: 'Ctrl-f', run: cursorCharRight, shift: selectCharRight },
            { key: 'Ctrl-p', run: cursorLineUp, shift: selectLineUp },
            { key: 'Ctrl-n', run: cursorLineDown, shift: selectLineDown },
            { key: 'Ctrl-a', run: cursorLineStart, shift: selectLineStart },
            { key: 'Ctrl-e', run: cursorLineEnd, shift: selectLineEnd },
            { key: 'Ctrl-k', run: deleteAllRight },
            { key: 'Ctrl-h', run: deleteCharBackward },
            { key: 'Ctrl-d', run: deleteCharForward },
            { key: 'Ctrl-t', run: transposeLetters },
            { key: 'Ctrl-o', run: splitLine },
            { key: 'Ctrl-j', run: joinLines },
        ] : [
            { key: 'Mod-Backspace', run: deleteGroupBackward },
            { key: 'Mod-Delete', run: deleteGroupForward },
        ]),
        // 回车(Shift+Enter 等同回车切段落:否则原生插 <br> 破 .cm-line 结构)
        { key: 'Enter', run: insertNewlineAndIndent },
        { key: 'Shift-Enter', run: insertNewlineAndIndent },
        // 开行(对齐 Monaco ⌘Enter 下开行 / ⌘⇧Enter 上开行)
        { key: 'Mod-Enter', run: insertLineAfter },
        { key: 'Mod-Shift-Enter', run: insertLineBefore },
        // 缩进(Mod-]/Mod-[ 对齐 Monaco 块缩进别名)
        { key: 'Tab', run: insertTab },
        { key: 'Shift-Tab', run: indentLess },
        { key: 'Mod-]', run: indentMore },
        { key: 'Mod-[', run: indentLess },
        // 跳到匹配括号(对齐 Monaco ⇧⌘\ jumpToBracket)
        { key: 'Mod-Shift-\\', run: cursorMatchingBracket },
        // 全选 / 撤销 / 重做(Mac 只有 ⇧⌘Z 重做,⌘Y 不是 Monaco 的 Mac 键位)
        { key: 'Mod-a', run: selectAll },
        { key: 'Mod-l', run: selectLine }, // 对齐 Monaco expandLineSelection：整行选中，重复扩行
        { key: 'Mod-z', run: undo },
        ...(mac ? [] : [{ key: 'Mod-y', run: redo }]),
        { key: 'Mod-Shift-z', run: redo },
        // 光标撤销/重做(Monaco cursorUndo ⌘U;cursorRedo 无默认键)
        { key: 'Mod-u', run: cursorUndo },
        // 剪贴板:复制/剪切在 keydown 里直接写(Clipboard API 写入只要用户手势,不要权限);粘贴走原生事件(见下)
        { key: 'Mod-c', run: copyCommand },
        { key: 'Mod-x', run: cutCommand },
        // 粘贴不绑键:交给浏览器原生 paste 事件(clipboard.ts 的 handlePaste)。keydown 里读剪贴板要用
        // navigator.clipboard.readText(),它在没授权的网页里直接被拒(Chromium 要 clipboard-read 权限,Safari/Firefox
        // 弹「粘贴」气泡),⌘V 就什么都不发生;Monaco 同样走原生 paste 事件。真浏览器差分见 scripts/browser-diff/clipboard.mjs(NOPERM=1)。
        // Monaco:⌘F2 Change All Occurrences(同 selectAllOccurrences)
        { key: 'Mod-F2', run: selectAllOccurrences },
        // 行移动 / 复制(复制行:Mac / Win ⇧⌥↑↓,Linux Ctrl+Shift+Alt+↑↓)
        { key: 'Alt-ArrowUp', run: moveLineUp },
        { key: 'Alt-ArrowDown', run: moveLineDown },
        { key: os === 'linux' ? 'Ctrl-Shift-Alt-ArrowUp' : 'Shift-Alt-ArrowUp', run: copyLineUp },
        { key: os === 'linux' ? 'Ctrl-Shift-Alt-ArrowDown' : 'Shift-Alt-ArrowDown', run: copyLineDown },
        // 上下加光标(Mac ⌥⌘↑↓;Win Ctrl+Alt+↑↓;Linux Ctrl+Shift+↑↓ 和 Shift+Alt+↑↓)
        ...(os === 'linux' ? [
            { key: 'Ctrl-Shift-ArrowUp', run: addCursorAbove },
            { key: 'Ctrl-Shift-ArrowDown', run: addCursorBelow },
            { key: 'Shift-Alt-ArrowUp', run: addCursorAbove },
            { key: 'Shift-Alt-ArrowDown', run: addCursorBelow },
        ] : [
            { key: 'Mod-Alt-ArrowUp', run: addCursorAbove },
            { key: 'Mod-Alt-ArrowDown', run: addCursorBelow },
        ]),
        { key: 'Shift-Alt-i', run: insertCursorAtEndOfEachLineSelected },
        // 键盘列选择(Monaco cursorColumnSelect*:⇧⌥⌘ / Ctrl+Shift+Alt 加方向键、翻页;Linux 不绑)
        ...(os === 'linux' ? [] : [
            { key: 'Mod-Shift-Alt-ArrowLeft', run: cursorColumnSelectLeft },
            { key: 'Mod-Shift-Alt-ArrowRight', run: cursorColumnSelectRight },
            { key: 'Mod-Shift-Alt-ArrowUp', run: cursorColumnSelectUp },
            { key: 'Mod-Shift-Alt-ArrowDown', run: cursorColumnSelectDown },
            { key: 'Mod-Shift-Alt-PageUp', run: cursorColumnSelectPageUp },
            { key: 'Mod-Shift-Alt-PageDown', run: cursorColumnSelectPageDown },
        ]),
        // Escape:收敛多光标/塌选区到单光标(补全开时前置的 closeCompletion 已拦截,单光标时返 false 不拦)
        { key: 'Escape', run: simplifySelection },
    ]
}

export const defaultKeymap: readonly KeyBinding[] = buildDefaultKeymap()

// 兜底:keymap 未命中时,是否该 preventDefault 阻断原生 contenteditable。
// 带命令修饰键(Cmd/Ctrl)但非组字的组合(Cmd+b 加粗、Cmd+i 斜体…)原生只会 mutate DOM 破坏 DOM≡doc
// 双射,一律拦。纯字符/Shift+字符/IME 组字/Alt 死键要放行给原生落字,绝不拦。
//
// 剪贴板三键必须放行:keydown 上 preventDefault 会扼杀后续 copy/cut/paste 事件,
// 我们的 contentDOM 监听(clipboard.ts)就永远收不到 → Cmd+C 无效。
// 真正写剪贴板/改 doc 仍由 copy/cut/paste handler 拦截(纯文本,不让原生塞 HTML)。
const CLIPBOARD_KEYS = new Set(['c', 'x', 'v', 'C', 'X', 'V'])

export function shouldBlockNative(event: KeyboardEvent): boolean {
    if (event.isComposing || event.keyCode === 229) return false
    // 只按下修饰键:不是命令,拦了会吞掉浏览器 / 宿主的 ⌘ 组合键监听(H14)
    if (MODIFIER_KEYS.has(event.key)) return false
    // Alt + 导航 / 删除键没绑的(⌥PageUp、⌥⇧Delete…):Monaco 不动,原生会挪光标或删词(E15)
    if (event.altKey && (NAV_KEYS.has(event.key) || event.key === 'Backspace' || event.key === 'Delete')) return true
    if (event.altKey) return false // Alt 可能参与死键/组字(Mac Option 组字)
    if (!(event.metaKey || event.ctrlKey)) return false
    // 仅 Cmd/Ctrl 单独 + c/x/v 放行(带 Shift 的 Cmd+Shift+C 等仍拦,无系统剪贴板语义)
    if (!event.shiftKey && CLIPBOARD_KEYS.has(event.key)) return false
    return true
}
