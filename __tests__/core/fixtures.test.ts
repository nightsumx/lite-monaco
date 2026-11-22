import { createSuite } from '../helpers/laws'
import { describe } from 'vitest'
import { Rope } from '../../src/core/model/rope'
import { ChangeSet } from '../../src/core/model/change'
import { buildTileTree } from '../../src/core/view/buildtile'
import { Decoration } from '../../src/core/model/decoration'
import { RangeSetBuilder } from '../../src/core/model/rangeset'

// CM7 fixture 快照(§6.5):具体输入→具体输出的回归点,propose/approve 人审流程。
// __fixtures__/<suite>/<case>/ 下:*.txt 输入 + out.txt 期望。
// UPDATE_SNAPSHOTS=1 → 产 out.txt.proposed(不碰 out.txt);teact approve 落盘。

const suite = createSuite(import.meta.dirname)

describe('fixture: rope.insert', () => {
    suite('rope.insert', (_input, _opts, { inputs }) => {
        const doc = Rope.of((inputs.text as string).split('\n'))
        const pos = parseInt(inputs.pos as string, 10)
        const str = Rope.of((inputs.str as string).split('\n'))
        return doc.replace(pos, pos, str).toString()
    })
})

describe('fixture: changeSet.compose', () => {
    suite('changeSet.compose', (_input, _opts, { inputs }) => {
        const doc = inputs.doc as string
        const docLen = doc.length
        // a.txt / b.txt 格式: from:to:insert
        const parseChange = (s: string) => {
            const [from, to, ...rest] = s.split(':')
            return { from: +from, to: +to, insert: rest.join(':') }
        }
        const a = parseChange(inputs.a as string)
        const b = parseChange(inputs.b as string)
        const csA = ChangeSet.of(a, docLen)
        // b 在 a 的结果上 compose,长度用 csA 的新长度
        const csB = ChangeSet.of(b, csA.newLength)
        const composed = csA.compose(csB)
        const rope = Rope.of(doc.split('\n'))
        return composed.apply(rope).toString()
    })
})

describe('fixture: buildTileTree', () => {
    suite('buildTileTree', (_input, _opts, { inputs }) => {
        const doc = Rope.of((inputs.doc as string).split('\n'))
        // marks.txt: 每行一个 "from-to-class" 装饰
        const marksStr = inputs.marks as string
        const builder = new RangeSetBuilder<Decoration>()
        if (marksStr) {
            for (const line of marksStr.split('\n')) {
                if (!line.trim()) continue
                const [from, to, cls] = line.split('-')
                builder.add(+from, +to, Decoration.mark({ class: cls }))
            }
        }
        const decos = builder.finish()
        const tree = buildTileTree(doc, [decos])
        return JSON.stringify(tree.toJSON(), null, 0)
    })
})
