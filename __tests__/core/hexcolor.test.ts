import { describe, expect, it } from 'vitest'
import { findHexColors } from '../../src/core/feature/hexcolor'

describe('findHexColors', () => {
    it('#rgb / #rrggbb / #rrggbbaa', () => {
        const text = 'a #f00 b #00ff00 c #11223344'
        expect(findHexColors(text)).toEqual([
            { from: 2, to: 6, color: '#ff0000' },
            { from: 9, to: 16, color: '#00ff00' },
            { from: 19, to: 28, color: '#11223344' },
        ])
    })

    it('不是独立 #hex 不收', () => {
        expect(findHexColors('abc#fff')).toEqual([])
        expect(findHexColors('#gg0000')).toEqual([])
        expect(findHexColors('#ff')).toEqual([])
    })
})
