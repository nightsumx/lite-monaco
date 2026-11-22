// 真浏览器验收页:补全下拉 / ghost text / 折行 / 装饰行高 / 括号对。jsdom 量不到的东西在这里量。
import { createHighlighter } from 'shiki'
import { createEditor, setDefaultHighlighter } from '../src/api/create'
import { registerCompletionItemProvider, registerInlineCompletionsProvider } from '../src/index'

const hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })
setDefaultHighlighter(hl as never)

registerCompletionItemProvider('typescript', {
    triggerCharacters: ['.'],
    provideCompletionItems(model: any, pos: any) {
        const w = model.getWordUntilPosition(pos)
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn }
        return { suggestions: ['alpha', 'alphabet', 'alphaBeta', 'beta', 'gamma'].map((label, i) => ({ label, kind: 5 + i, insertText: label, range, detail: 'd' + i, documentation: 'doc ' + label })) }
    },
} as never)

registerInlineCompletionsProvider('typescript', {
    provideInlineCompletions(model: any, pos: any) {
        const line = model.getLineContent(pos.lineNumber)
        if (!line.endsWith('const ghost = ')) return { items: [] }
        return { items: [{ insertText: '[1, 2, 3].map(x => x * 2)\n// second line of ghost', range: { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: pos.column, endColumn: pos.column } }] }
    },
    disposeInlineCompletions() {},
} as never)

const long = 'const longLine = "' + 'lorem ipsum dolor sit amet '.repeat(12) + '"'
const editor: any = createEditor(document.getElementById('host')!, {
    value: ['function f() {', '  const a = (1 + [2, {x: 3}])', '  al', '  ' + long, '  const ghost = ', '  decorated', '  after', '}'].join('\n'),
    language: 'typescript', theme: 'vs-dark', wordWrap: 'on', automaticLayout: true, fontSize: 13, lineHeight: 20,
    bracketPairColorization: { enabled: true },
} as never)
;(window as any).editor = editor
const log = (m: string) => { document.getElementById('log')!.textContent += m + '\n' }
;(window as any).vlog = log
const deco = editor.createDecorationsCollection?.([{ range: { startLineNumber: 6, startColumn: 1, endLineNumber: 6, endColumn: 1 }, options: { lineHeight: 50, className: 'tall' } }])
log('ready; lines=' + editor.getModel().getLineCount() + ' deco=' + (deco ? 'ok' : 'none'))
