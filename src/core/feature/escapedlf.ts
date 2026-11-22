// wrapOnEscapedLineFeeds(默认 false)—— 照 Monaco monospaceLineBreaksComputer:开折行时,
// 含 `"` 和字面 `\n` 的行,在每个字面 `\n`(反斜杠个数为奇数)之后强制折行(isEscapedLineBreakAtPosition)。
// 折行在这里由浏览器 CSS 完成、不能往正文塞节点(DOM≡doc),所以把 `\n` 两个字符包进 mark,
// 用 ::after { content: '\A' }(pre-wrap 下是强制换行,伪元素不进 DOM 文本)强制断行。
// 只在折行开着(wordWrap != off)时画;关着时 Monaco 的 line breaks computer 也不跑。
import type { EditorState } from '../model/state'
import { Decoration, type DecorationSet } from '../model/decoration'
import { RangeSetBuilder } from '../model/rangeset'
import { getOption } from '../options'
import { lexicalDecorations } from './lexscan'

const mark = Decoration.mark({ class: 'cm-escapedLF' })
const EMPTY: DecorationSet = new RangeSetBuilder<Decoration>().finish()

const scan = lexicalDecorations((text, offset, b) => {
    for (let lineStart = 0; lineStart <= text.length;) {
        let nl = text.indexOf('\n', lineStart)
        if (nl < 0) nl = text.length
        // Monaco isLineFeedWrappingEnabled:行里要同时有 " 和 \n
        const first = text.indexOf('\\n', lineStart)
        if (first >= 0 && first < nl && text.lastIndexOf('"', nl - 1) >= lineStart) {
            for (let i = first; i >= 0 && i + 2 < nl; i = text.indexOf('\\n', i + 1)) {
                // i 处是 `\n` 的反斜杠;连续反斜杠个数为奇数才是转义,且后面还有字符(折点在 \n 之后、下一个字符之前)
                let run = 1
                for (let j = i - 1; j >= lineStart && text.charAt(j) === '\\'; j--) run++
                if (run % 2 === 1) b.add(offset + i, offset + i + 2, mark)
            }
        }
        lineStart = nl + 1
    }
})

function wrapOn(state: EditorState): boolean {
    const o2 = getOption(state, 'wordWrapOverride2')
    const o1 = getOption(state, 'wordWrapOverride1')
    return (o2 !== 'inherit' ? o2 : o1 !== 'inherit' ? o1 : getOption(state, 'wordWrap')) !== 'off'
}

/** 装进 decorations facet:选项关着 / 没开折行时不画 */
export function escapedLineFeedDecorations(state: EditorState, view?: Parameters<typeof scan>[1]): DecorationSet {
    return getOption(state, 'wrapOnEscapedLineFeeds') && wrapOn(state) ? scan(state, view) : EMPTY
}
