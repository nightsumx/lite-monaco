// 能力 H1/H12: composition 状态机 + tabFocusMode
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputState, modifierCodes, PENDING_IOS_KEYS, firefoxCopyCutHack } from '../../src/core/input/inputstate'
import { temporarilySetTabFocusMode, toggleTabFocusMode } from '../../src/core/edit/commands'
import { browser } from '../../src/core/browser'

function makeViewStub(overrides: Partial<{ composing: boolean }> = {}) {
    return {
        composing: overrides.composing ?? false,
        observer: {
            flushSoon: vi.fn(),
            flush: vi.fn(),
            pendingRecords: () => [] as MutationRecord[],
        },
        inputState: null as unknown as InputState,
    } as any
}

describe('InputState composition 状态机', () => {
    it('初始 composing=-1', () => {
        const s = new InputState()
        expect(s.composing).toBe(-1)
        expect(s.compositionFirstChange).toBeNull()
        expect(s.compositionPendingKey).toBe(false)
        expect(s.tabFocusMode).toBe(-1)
    })

    it('startComposition: composing=0, firstChange=true', () => {
        const s = new InputState()
        s.startComposition()
        expect(s.composing).toBe(0)
        expect(s.compositionFirstChange).toBe(true)
        s.startComposition() // 重复
        expect(s.composing).toBe(0)
        expect(s.compositionFirstChange).toBe(true)
    })

    it('noteComposingChange 递增计数', () => {
        const s = new InputState()
        s.startComposition()
        s.noteComposingChange()
        s.noteComposingChange()
        expect(s.composing).toBe(2)
    })

    it('endComposition 复位并记 pending', () => {
        const s = new InputState()
        s.startComposition()
        s.noteComposingChange()
        const view = makeViewStub()
        view.inputState = s
        s.endComposition(view, true)
        expect(s.composing).toBe(-1)
        expect(s.compositionFirstChange).toBeNull()
        expect(s.compositionPendingKey).toBe(true)
        expect(s.compositionPendingChange).toBe(true)
        expect(s.compositionEndedAt).toBeGreaterThan(0)
    })

    it('userEventForChange 标 compose / compose.start', () => {
        const s = new InputState()
        s.startComposition()
        const view = { composing: true, inputState: s } as any
        expect(s.userEventForChange(view)).toBe('input.type.compose.start')
        expect(s.compositionFirstChange).toBe(false)
        expect(s.userEventForChange(view)).toBe('input.type.compose')
    })

    it('userEventForChange compositionPendingChange 50ms 窗', () => {
        const s = new InputState()
        s.compositionPendingChange = true
        s.compositionEndedAt = Date.now()
        const view = { composing: false, inputState: s } as any
        expect(s.userEventForChange(view)).toContain('compose')
        expect(s.compositionPendingChange).toBe(false)
    })

    it('ignoreDuringComposition: composing>0 时吞 key', () => {
        const s = new InputState()
        s.composing = 2
        expect(s.ignoreDuringComposition(new KeyboardEvent('keydown', { key: 'a' }))).toBe(true)
        expect(s.ignoreDuringComposition(new KeyboardEvent('mousedown'))).toBe(false)
    })

    it('ignoreDuringComposition: synthetic 不吞', () => {
        const s = new InputState()
        s.composing = 2
        const e = new KeyboardEvent('keydown', { key: 'Enter' })
        ;(e as any).synthetic = true
        expect(s.ignoreDuringComposition(e)).toBe(false)
    })

    it('Safari compositionPendingKey 100ms 窗吞 Enter', () => {
        const s = new InputState()
        s.compositionPendingKey = true
        s.compositionEndedAt = Date.now()
        // 仅在 safari && !ios 分支生效；若当前环境不是 safari 则跳过语义断言结构
        const ignored = s.ignoreDuringComposition(new KeyboardEvent('keydown', { key: 'Enter' }))
        if (browser.safari && !browser.ios) {
            expect(ignored).toBe(true)
            expect(s.compositionPendingKey).toBe(false)
        } else {
            expect(typeof ignored).toBe('boolean')
        }
    })
})

describe('tabFocusMode H12', () => {
    it('toggleTabFocusMode 在永久开与关之间切', () => {
        const view = { inputState: { tabFocusMode: -1 } }
        expect(toggleTabFocusMode(view)).toBe(true)
        expect(view.inputState.tabFocusMode).toBe(0)
        expect(toggleTabFocusMode(view)).toBe(true)
        expect(view.inputState.tabFocusMode).toBe(-1)
    })

    it('temporarilySetTabFocusMode 设 2s 窗口', () => {
        const view = { inputState: { tabFocusMode: -1 } }
        const before = Date.now()
        expect(temporarilySetTabFocusMode(view)).toBe(true)
        expect(view.inputState.tabFocusMode).toBeGreaterThanOrEqual(before + 2000)
        expect(view.inputState.tabFocusMode).toBeLessThan(before + 2500)
    })

    it('临时模式时间戳 / 永久 0 / 关 -1', () => {
        const s = new InputState()
        s.tabFocusMode = Date.now() + 2000
        expect(s.tabFocusMode).toBeGreaterThan(Date.now())
        s.tabFocusMode = 0
        expect(s.tabFocusMode).toBe(0)
        s.tabFocusMode = -1
        expect(s.tabFocusMode).toBe(-1)
    })

    it('modifierCodes 含 Shift/Ctrl/Alt/Meta', () => {
        expect(modifierCodes).toContain(16)
        expect(modifierCodes).toContain(17)
        expect(modifierCodes).toContain(18)
        expect(modifierCodes).toContain(91)
    })

    it('PENDING_IOS_KEYS 含 Backspace/Enter/Delete', () => {
        const codes = PENDING_IOS_KEYS.map(k => k.keyCode)
        expect(codes).toContain(8)
        expect(codes).toContain(13)
        expect(codes).toContain(46)
    })
})

describe('firefoxCopyCutHack H7', () => {
    afterEach(() => {
        // 不清理 Set，二次调用应幂等
    })
    it('幂等挂载空 copy/cut 监听', () => {
        const doc = document
        expect(() => firefoxCopyCutHack(doc)).not.toThrow()
        expect(() => firefoxCopyCutHack(doc)).not.toThrow()
    })
})

describe('beforeinput 缓存字段', () => {
    it('insertingText 可写读', () => {
        const s = new InputState()
        s.insertingText = 'hello'
        s.insertingTextAt = Date.now()
        expect(s.insertingText).toBe('hello')
        expect(s.insertingTextAt).toBeGreaterThan(0)
    })

    it('setSelectionOrigin 记时间', () => {
        const s = new InputState()
        s.setSelectionOrigin('select.pointer')
        expect(s.lastSelectionOrigin).toBe('select.pointer')
        expect(s.lastSelectionTime).toBeGreaterThan(0)
    })
})
