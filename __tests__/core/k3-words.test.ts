import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { editorOptions } from '../../src/core/options'
import type { IEditorOptions } from '../../src/core/options'
import { isWholeWordAt, moveWordLeft, moveWordRight, stateWordClassifier, wordAtPosition, WordNav } from '../../src/core/edit/words'
import { EditorSelection } from '../../src/core/model/selection'

function st(doc: string, options: IEditorOptions = {}, pos = 0) {
    return EditorState.create({ doc, selection: EditorSelection.cursor(pos), extensions: [editorOptions.of(options)] })
}

describe('wordSeparators', () => {
    it('默认值:- 是分隔符,foo-bar 里 foo 是一个词', () => {
        const s = st('foo-bar', {}, 1)
        expect(wordAtPosition(s, 1)).toEqual({ from: 0, to: 3 })
        expect(moveWordRight(s, 0, WordNav.WordEnd)).toBe(3)
    })

    it('非默认值:把 - 拿掉后 foo-bar 是一个词', () => {
        const sep = '`~!@#$%^&*()=+[{]}\\|;:\'",.<>/?'
        const s = st('foo-bar', { wordSeparators: sep }, 1)
        expect(wordAtPosition(s, 1)).toEqual({ from: 0, to: 7 })
        expect(moveWordRight(s, 0, WordNav.WordEnd)).toBe(7)
        expect(moveWordLeft(st('foo-bar', { wordSeparators: sep }, 7), 7, WordNav.WordStart)).toBe(0)
    })

    it('非默认值:新增分隔符 _ 后 foo_bar 拆成两个词', () => {
        const s = st('foo_bar', { wordSeparators: '_' }, 1)
        expect(wordAtPosition(s, 1)).toEqual({ from: 0, to: 3 })
        const d = st('foo_bar', {}, 1)
        expect(wordAtPosition(d, 1)).toEqual({ from: 0, to: 7 })
    })

    it('整词判定(⌘D / 查找整词)读 wordSeparators', () => {
        const sep = '`~!@#$%^&*()=+[{]}\\|;:\'",.<>/?'
        const text = 'foo-x'
        // 默认:- 是分隔符,foo 是整词;去掉 - 后 foo 后面紧跟词字符,不再是整词
        expect(isWholeWordAt(text, 0, 3, stateWordClassifier(st(text)))).toBe(true)
        expect(isWholeWordAt(text, 0, 3, stateWordClassifier(st(text, { wordSeparators: sep })))).toBe(false)
    })
})

describe('wordSegmenterLocales', () => {
    it('默认空:中文整段是一个词', () => {
        const s = st('你好世界', {}, 0)
        expect(moveWordRight(s, 0, WordNav.WordEnd)).toBe(4)
    })

    it.skipIf(typeof Intl === 'undefined' || !('Segmenter' in Intl))('配 zh 后按词切分', () => {
        const s = st('你好世界', { wordSegmenterLocales: 'zh' }, 0)
        const end = moveWordRight(s, 0, WordNav.WordEnd)
        expect(end).toBeLessThan(4)
        expect(end).toBeGreaterThan(0)
    })
})
