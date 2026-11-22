import { words, lines, snapAll } from './_util.mjs'
const para = lines(6, i => words(i * 23 + 7))
const noSpaces = 'a'.repeat(300) + '\n' + 'x'.repeat(50)
const tabs = lines(3, () => '\t\t' + words(40))
const mixed = '中文字符'.repeat(60) + '\n' + 'emoji😀'.repeat(40) + '\nhttps://example.com/' + 'path/'.repeat(30) + '\n(a)(b)(c)'.repeat(30)
const W = (name, value, options, extra, w) => ({ name, create: { value, options: { wordWrap: 'on', ...options }, ...(w ? { width: w } : {}) }, steps: [snapAll('a', { domBreaks: true, ...extra })] })
export default [
    W('words', para),
    W('words-narrow-300', para, {}, {}, 300),
    W('no-spaces', noSpaces),
    W('tabs', tabs),
    W('indent-same', '    ' + words(60), { wrappingIndent: 'same' }),
    W('indent-indent', '    ' + words(60), { wrappingIndent: 'indent' }),
    W('indent-deepIndent', '    ' + words(60), { wrappingIndent: 'deepIndent' }),
    W('indent-none', '    ' + words(60), { wrappingIndent: 'none' }),
    W('column-40', para, { wordWrap: 'wordWrapColumn', wordWrapColumn: 40 }),
    W('bounded', para, { wordWrap: 'bounded', wordWrapColumn: 40 }),
    W('cjk-emoji-url', mixed),
    W('wordBreak-keepAll', mixed, { wordBreak: 'keepAll' }),
    W('minimap-on', para, { minimap: { enabled: true } }),
    W('off', para, { wordWrap: 'off' }, { positions: [[3, 1], [3, 100]] }),
    {
        name: 'resize-rewrap', create: { value: para, options: { wordWrap: 'on' } },
        steps: [snapAll('wide', { domBreaks: true }), { do: 'resize', w: 400, h: 400 }, snapAll('narrow', { domBreaks: true }), { do: 'resize', w: 800, h: 400 }, snapAll('wide2', { domBreaks: true })],
    },
    {
        name: 'toggle-wrap-alt-z', create: { value: para }, steps: [
            snapAll('off'), { do: 'eval', code: 'editor.updateOptions({wordWrap:"on"})' }, snapAll('on', { domBreaks: true }),
            { do: 'eval', code: 'editor.updateOptions({wordWrap:"off"})' }, snapAll('off2'),
        ],
    },
]
