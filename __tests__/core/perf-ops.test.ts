import { describe, expect, it } from 'vitest'
import { COVERED_COMMANDS, uncoveredDefaultKeymap } from '../../demo/perf-ops'

describe('操作时延表覆盖', () => {
    it('defaultKeymap 每个去重命令都在表里', () => {
        expect(uncoveredDefaultKeymap()).toEqual([])
    })

    it('覆盖列表无重复引用', () => {
        expect(new Set(COVERED_COMMANDS).size).toBe(COVERED_COMMANDS.length)
    })
})
