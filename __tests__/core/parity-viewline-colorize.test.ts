// 对齐套件里 viewLineRenderer.test.ts 的「着色一行 → HTML」部分,逐条翻译成自有单测。
//
// 为什么能直接比 HTML:Monaco 的 viewLineRenderer 在编辑器里和在 monaco.editor.colorize* 里是同一套规则
// (空格/tab 记 U+00A0、`< > &` 转义、NUL → &#00;、BOM/LS/PS → U+FFFD、全角占两列、50 列拆长 token、
// RTL 不拆且包 dir=rtl)。lite-monaco 的 api/viewlinerenderer.ts 就是这一部分的移植(静态 colorize 家族走它),
// 所以原版 `.snap` 里的期望串(下面 html 字段)可以原样比。编辑器正文自己的渲染不走 HTML 串,
// 那一半在 parity-viewline-editor.test.ts 里按 DOM 翻译。
//
// 每个 it 的标题 = 原版 suite + 测试标题,方便和 viewLineRenderer.test.ts 对照。
import { describe, expect, it } from 'vitest'
import { renderColorizedLine } from '../../src/api/viewlinerenderer'
import type { IViewLineTokens } from '../../src/api/tokenization'
import { visibleColumn } from '../../src/core/edit/vcol'

function tokens(content: string, parts: [number, number][]): IViewLineTokens {
    const ends: number[] = parts.map(p => p[0])
    const cls: string[] = parts.map(p => 'mtk' + p[1])
    const start = (i: number) => (i === 0 ? 0 : ends[i - 1])
    return {
        getCount: () => parts.length,
        getLineContent: () => content,
        getStartOffset: start,
        getEndOffset: (i: number) => ends[i],
        getClassName: (i: number) => cls[i],
        getTokenText: (i: number) => content.substring(start(i), ends[i]),
    } as unknown as IViewLineTokens
}
const colorize = (content: string, parts: [number, number][], tab = 4) => renderColorizedLine(content, tokens(content, parts), tab)

// 原版 renderViewLine 在 ws=none、无装饰、无 faux indent 时的快照(.0.html),整行外面再包一层 <span>
const SNAPSHOT_ROWS: { title: string, content: string, parts: [number, number][], tab: number, html: string }[] = [
    { title: "viewLineRenderer.renderLine issue #2255: Weird line rendering part 1", content: "\t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),", parts: [[3,1],[15,2],[21,3],[22,4],[43,5],[45,6],[46,7],[66,8],[67,9],[68,10]], tab: 4, html: "<span><span class=\"mtk1\">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span><span class=\"mtk2\">cursorStyle:</span><span class=\"mtk3\">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span><span class=\"mtk4\">(</span><span class=\"mtk5\">prevOpts.cursorStyle\u00a0</span><span class=\"mtk6\">!=</span><span class=\"mtk7\">=</span><span class=\"mtk8\">\u00a0newOpts.cursorStyle</span><span class=\"mtk9\">)</span><span class=\"mtk10\">,</span></span>" },
    { title: "viewLineRenderer.renderLine issue #2255: Weird line rendering part 2", content: " \t\t\tcursorStyle:\t\t\t\t\t\t(prevOpts.cursorStyle !== newOpts.cursorStyle),", parts: [[4,1],[16,2],[22,3],[23,4],[44,5],[46,6],[47,7],[67,8],[68,9],[69,10]], tab: 4, html: "<span><span class=\"mtk1\">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span><span class=\"mtk2\">cursorStyle:</span><span class=\"mtk3\">\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</span><span class=\"mtk4\">(</span><span class=\"mtk5\">prevOpts.cursorStyle\u00a0</span><span class=\"mtk6\">!=</span><span class=\"mtk7\">=</span><span class=\"mtk8\">\u00a0newOpts.cursorStyle</span><span class=\"mtk9\">)</span><span class=\"mtk10\">,</span></span>" },
    { title: "viewLineRenderer.renderLine issue microsoft/monaco-editor#280: Improved source code rendering for RTL languages", content: "var קודמות = \"מיותר קודמות צ'ט של, אם לשון העברית שינויים ויש, אם\";", parts: [[3,6],[13,1],[66,20],[67,1]], tab: 4, html: "<span><span class=\"mtk6\">var</span><span dir=\"rtl\" style=\"unicode-bidi:isolate\" class=\"mtk1\">\u00a0קודמות\u00a0=\u00a0</span><span dir=\"rtl\" style=\"unicode-bidi:isolate\" class=\"mtk20\">\"מיותר\u00a0קודמות\u00a0צ'ט\u00a0של,\u00a0אם\u00a0לשון\u00a0העברית\u00a0שינויים\u00a0ויש,\u00a0אם\"</span><span class=\"mtk1\">;</span></span>" },
    { title: "viewLineRenderer.renderLine issue #137036: Issue in RTL languages in recent versions", content: "<option value=\"العربية\">العربية</option>", parts: [[1,2],[7,3],[8,4],[13,5],[14,4],[23,6],[24,2],[31,4],[33,2],[39,3],[40,2]], tab: 4, html: "<span><span class=\"mtk2\">&lt;</span><span class=\"mtk3\">option</span><span class=\"mtk4\">\u00a0</span><span class=\"mtk5\">value</span><span class=\"mtk4\">=</span><span dir=\"rtl\" style=\"unicode-bidi:isolate\" class=\"mtk6\">\"العربية\"</span><span class=\"mtk2\">&gt;</span><span dir=\"rtl\" style=\"unicode-bidi:isolate\" class=\"mtk4\">العربية</span><span class=\"mtk2\">&lt;/</span><span class=\"mtk3\">option</span><span class=\"mtk2\">&gt;</span></span>" },
    { title: "viewLineRenderer.renderLine issue #6885: Does not split large tokens in RTL text", content: "את גרמנית בהתייחסות שמו, שנתי המשפט אל חפש, אם כתב אחרים ולחבר. של התוכן אודות בויקיפדיה כלל, של עזרה כימיה היא. על עמוד יוצרים מיתולוגיה סדר, אם שכל שתפו לעברית שינויים, אם שאלות אנגלית עזה. שמות בקלות מה סדר.", parts: [[210,1]], tab: 4, html: "<span><span dir=\"rtl\" style=\"unicode-bidi:isolate\" class=\"mtk1\">את\u00a0גרמנית\u00a0בהתייחסות\u00a0שמו,\u00a0שנתי\u00a0המשפט\u00a0אל\u00a0חפש,\u00a0אם\u00a0כתב\u00a0אחרים\u00a0ולחבר.\u00a0של\u00a0התוכן\u00a0אודות\u00a0בויקיפדיה\u00a0כלל,\u00a0של\u00a0עזרה\u00a0כימיה\u00a0היא.\u00a0על\u00a0עמוד\u00a0יוצרים\u00a0מיתולוגיה\u00a0סדר,\u00a0אם\u00a0שכל\u00a0שתפו\u00a0לעברית\u00a0שינויים,\u00a0אם\u00a0שאלות\u00a0אנגלית\u00a0עזה.\u00a0שמות\u00a0בקלות\u00a0מה\u00a0סדר.</span></span>" },
    { title: "viewLineRenderer.renderLine issue #20624: Unaligned surrogate pairs are corrupted at multiples of 50 columns", content: "a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷", parts: [[241,1]], tab: 4, html: "<span><span class=\"mtk1\">a𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷𠮷</span></span>" },
    { title: "viewLineRenderer.renderLine issue #95685: Uses unicode replacement character for Paragraph Separator", content: "var ftext = [\u2029\"Und\", \"dann\", \"eines\"];", parts: [[38,1]], tab: 4, html: "<span><span class=\"mtk1\">var\u00a0ftext\u00a0=\u00a0[\ufffd\"Und\",\u00a0\"dann\",\u00a0\"eines\"];</span></span>" },
    { title: "viewLineRenderer.renderLine 2 createLineParts simple", content: "Hello world!", parts: [[12,1]], tab: 4, html: "<span><span class=\"mtk1\">Hello\u00a0world!</span></span>" },
    { title: "viewLineRenderer.renderLine 2 createLineParts simple two tokens", content: "Hello world!", parts: [[6,1],[12,2]], tab: 4, html: "<span><span class=\"mtk1\">Hello\u00a0</span><span class=\"mtk2\">world!</span></span>" },
    { title: "viewLineRenderer.renderLine 2 issue #22352: COMBINING ACUTE ACCENT (U+0301)", content: "12345689012345678901234568901234567890123456890abába", parts: [[53,3]], tab: 4, html: "<span><span class=\"mtk3\">12345689012345678901234568901234567890123456890abába</span></span>" },
    { title: "viewLineRenderer.renderLine 2 issue #22352: Partially Broken Complex Script Rendering of Tamil", content: " JoyShareல் பின்தொடர்ந்து, விடீயோ, ஜோக்குகள், அனிமேசன், நகைச்சுவை படங்கள் மற்றும் செய்திகளை பெறுவீர்", parts: [[100,3]], tab: 4, html: "<span><span class=\"mtk3\">\u00a0JoyShareல்\u00a0பின்தொடர்ந்து,\u00a0விடீயோ,\u00a0ஜோக்குகள்,\u00a0</span><span class=\"mtk3\">அனிமேசன்,\u00a0நகைச்சுவை\u00a0படங்கள்\u00a0மற்றும்\u00a0செய்திகளை\u00a0</span><span class=\"mtk3\">பெறுவீர்</span></span>" },
    { title: "viewLineRenderer.renderLine 2 issue #42700: Hindi characters are not being rendered properly", content: " वो ऐसा क्या है जो हमारे अंदर भी है और बाहर भी है। जिसकी वजह से हम सब हैं। जिसने इस सृष्टि की रचना की है।", parts: [[105,3]], tab: 4, html: "<span><span class=\"mtk3\">\u00a0वो\u00a0ऐसा\u00a0क्या\u00a0है\u00a0जो\u00a0हमारे\u00a0अंदर\u00a0भी\u00a0है\u00a0और\u00a0बाहर\u00a0भी\u00a0है।\u00a0</span><span class=\"mtk3\">जिसकी\u00a0वजह\u00a0से\u00a0हम\u00a0सब\u00a0हैं।\u00a0जिसने\u00a0इस\u00a0सृष्टि\u00a0की\u00a0रचना\u00a0की\u00a0</span><span class=\"mtk3\">है।</span></span>" },
    { title: "viewLineRenderer.renderLine 2 issue #22832: Consider fullwidth characters when rendering tabs", content: "asd = \"擦\"\t\t#asd", parts: [[15,3]], tab: 4, html: "<span><span class=\"mtk3\">asd\u00a0=\u00a0\"擦\"\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0#asd</span></span>" },
]

describe('viewLineRenderer 快照(着色 HTML)', () => {
    for (const r of SNAPSHOT_ROWS) {
        it(r.title, () => {
            expect(colorize(r.content, r.parts, r.tab)).toBe(r.html)
        })
    }
})

// ── viewLineRenderer.renderLine:逐字符替换 + 字符映射 ──
// 原版 assertCharacterReplacement 还断言 CharacterMapping 的水平偏移(字符 i 之前占几列)。
// 我们的对应物是 visibleColumn(text, i, tabSize):编辑器里 tab 是真的 \t,宽度靠 tab-size 展开,
// 所以「第 i 个字符前占几列」由它算,不在 HTML 里展开成 nbsp 之外还有第二份。
describe('viewLineRenderer.renderLine', () => {
    function assertCharacterReplacement(lineContent: string, tabSize: number, expected: string, expectedCharOffsetInPart: number[]) {
        expect(colorize(lineContent, [[lineContent.length, 0]], tabSize)).toBe('<span><span class="mtk0">' + expected + '</span></span>')
        const cols: number[] = []
        for (let i = 0; i <= lineContent.length; i++) cols.push(visibleColumn(lineContent, i, tabSize))
        expect(cols).toEqual(expectedCharOffsetInPart)
    }

    it('replaces spaces', () => {
        assertCharacterReplacement(' ', 4, '\u00a0', [0, 1])
        assertCharacterReplacement('  ', 4, '\u00a0\u00a0', [0, 1, 2])
        assertCharacterReplacement('a  b', 4, 'a\u00a0\u00a0b', [0, 1, 2, 3, 4])
    })

    it('escapes HTML markup', () => {
        assertCharacterReplacement('a<b', 4, 'a&lt;b', [0, 1, 2, 3])
        assertCharacterReplacement('a>b', 4, 'a&gt;b', [0, 1, 2, 3])
        assertCharacterReplacement('a&b', 4, 'a&amp;b', [0, 1, 2, 3])
    })

    it('replaces some bad characters', () => {
        assertCharacterReplacement('a\0b', 4, 'a&#00;b', [0, 1, 2, 3])
        assertCharacterReplacement('a\ufeffb', 4, 'a\ufffdb', [0, 1, 2, 3])
        assertCharacterReplacement('a\u2028b', 4, 'a\ufffdb', [0, 1, 2, 3])
    })

    it('handles tabs', () => {
        assertCharacterReplacement('\t', 4, '\u00a0\u00a0\u00a0\u00a0', [0, 4])
        assertCharacterReplacement('x\t', 4, 'x\u00a0\u00a0\u00a0', [0, 1, 4])
        assertCharacterReplacement('xx\t', 4, 'xx\u00a0\u00a0', [0, 1, 2, 4])
        assertCharacterReplacement('xxx\t', 4, 'xxx\u00a0', [0, 1, 2, 3, 4])
        assertCharacterReplacement('xxxx\t', 4, 'xxxx\u00a0\u00a0\u00a0\u00a0', [0, 1, 2, 3, 4, 8])
    })

    // 原版 assertParts:HTML + [水平偏移, [part, 字符]] 映射。映射这一半对应「token 边界在哪个 span」,这里看每个 span 的文字
    it('empty line', () => {
        expect(colorize('', [])).toBe('<span><span></span></span>')
    })

    it('uses part type', () => {
        expect(colorize('x', [[1, 10]])).toBe('<span><span class="mtk10">x</span></span>')
        expect(colorize('x', [[1, 20]])).toBe('<span><span class="mtk20">x</span></span>')
        expect(colorize('x', [[1, 30]])).toBe('<span><span class="mtk30">x</span></span>')
    })

    it('two parts', () => {
        expect(colorize('xy', [[1, 1], [2, 2]])).toBe('<span><span class="mtk1">x</span><span class="mtk2">y</span></span>')
        expect(colorize('xyz', [[1, 1], [3, 2]])).toBe('<span><span class="mtk1">x</span><span class="mtk2">yz</span></span>')
        expect(colorize('xyz', [[2, 1], [3, 2]])).toBe('<span><span class="mtk1">xy</span><span class="mtk2">z</span></span>')
    })

    it('issue #6885: Splits large tokens', () => {
        const text = 'This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.'
        const nb = (s: string) => s.replace(/ /g, '\u00a0')
        const check = (message: string, n: number, spans: string[]) =>
            expect(colorize(text.substring(0, n), [[n, 1]]), message).toBe('<span>' + spans.map(x => `<span class="mtk1">${nb(x)}</span>`).join('') + '</span>')
        const A = 'This is just a long line that contains very intere' // 50 列
        check('49 chars', 49, [A.substring(0, 49)])
        check('50 chars', 50, [A])
        check('51 chars', 51, [A, 's'])
        check('99 chars', 99, [A, 'sting text. This is just a long line that contain'])
        check('100 chars', 100, [A, 'sting text. This is just a long line that contains'])
        check('101 chars', 101, [A, 'sting text. This is just a long line that contains', ' '])
    })

    // 原版:fontLigatures 开着时不拆长 token(拆开会打断连字)。colorize 家族没有这个开关(固定拆),
    // 编辑器正文本来就不按 50 列拆 token,所以连字不会被打断:见 parity-viewline-editor.test.ts 同名用例。
})
