import { describe, expect, it } from 'vitest'
import { findTrailingWhitespace } from '../../src/core/feature/whitespace'

describe('findTrailingWhitespace', () => {
    it('行尾空格/Tab 钉上，行中的不收', () => {
        expect(findTrailingWhitespace('a  \nb\t\nok')).toEqual([
            { from: 1, to: 3 },
            { from: 5, to: 6 },
        ])
        expect(findTrailingWhitespace('a b')).toEqual([])
    })
})
