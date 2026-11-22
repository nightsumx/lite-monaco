// TS hover 的 related information(Monaco markerHoverParticipant):每条一行
// `<文件名>(行, 列): 消息`,文件名是 basename(Monaco 是 model URI 的 basename,对照页上是 "1";
// lite-monaco 是 TS 文件名,如 main.ts),点它跳过去。Monaco 0.52.2 实测(/tmp/lc-hunt/d-smart/t12-hover.ts):
//   The signature '(a: number, b: number): number' of 'add' is deprecated.(6387)
//   1(10, 4): The declaration was marked as deprecated here.
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { EditorView } from '../../src/core/view/editorview'
import { diagnosticsField } from '../../src/core/feature/diagnostics'
import { tsDiagnosticsSession, tsTagField, tsTagHoverMarkers } from '../../src/lang/tsdiagnostics'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { diagnosticHoverSource, hoverSources, showHover } from '../../src/core/feature/hover'
import { tsQuickInfoSource } from '../../src/lang/tsquickinfo'

const SLOW = 60_000

function mountView(doc: string, extensions: import('../../src/core/model/state').Extension[] = []) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.single(doc.length), extensions }), parent: host })
    return { view, done: () => { view.destroy(); host.remove() } }
}
async function until(pred: () => boolean, ms = 20_000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
        if (pred()) return true
        await new Promise(r => setTimeout(r, 20))
    }
    return false
}

// t12-hover.ts 的文档(@deprecated 在第 10 行第 4 列)
const DOC = `/**
 * Adds **two** numbers.
 *
 * \`\`\`ts
 * add(1, 2) // 3
 * \`\`\`
 * @param a - the first
 * @param b the second
 * @returns the sum
 * @deprecated use plus
 */
function add(a: number, b: number): number { return a + b }
const total: number = add(1, 2)
export {}
`

describe('TS hover:deprecated 的 related information 行(Monaco markerHoverParticipant)', () => {
    it('废弃调用的卡里有「main.ts(10, 4): The declaration was marked as deprecated here.」,点它跳到 @deprecated', async () => {
        clearTSServiceCache()
        const fileName = '/main.ts'
        const { view, done } = mountView(DOC, [diagnosticsField, tsTagField, hoverSources.of(diagnosticHoverSource), tsTagHoverMarkers, hoverSources.of(tsQuickInfoSource({ lang: 'typescript', fileName }))])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName, debounceMs: 1 })
        expect(await until(() => view.state.field(tsTagField).some(m => m.tag === 'deprecated'))).toBe(true)
        const use = DOC.lastIndexOf('add(1, 2)')
        view.dispatch(view.state.update({ selection: EditorSelection.single(use + 1) }))
        expect(await showHover(view)).toBe(true)
        const card = view.dom.querySelector('.cm-tooltip-hover')!
        const row = card.querySelector('.cm-diagnostic-hint')!
        expect(row.querySelector('.cm-diagnostic-msg')!.textContent).toBe("The signature '(a: number, b: number): number' of 'add' is deprecated.")
        const rel = [...row.querySelectorAll<HTMLElement>('.cm-diagnostic-related')]
        expect(rel.map(r => r.textContent)).toEqual(['main.ts(10, 4): The declaration was marked as deprecated here.'])
        // 和 Monaco 一样:链接部分是 `文件(行, 列): `,消息跟在后面
        const a = rel[0].querySelector('a')!
        expect(a.textContent).toBe('main.ts(10, 4): ')
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        const head = view.state.selection.main.head
        const line = view.state.doc.lineAt(head)
        expect([line.number, head - line.from + 1]).toEqual([10, 4])
        off()
        done()
    }, SLOW)

    it('没有 related information 的标签诊断不加行(未使用 6133)', async () => {
        clearTSServiceCache()
        const doc = 'function f() { const unused = 1 }\nexport {}\n'
        const fileName = '/rel-none.ts'
        const { view, done } = mountView(doc, [diagnosticsField, tsTagField, hoverSources.of(diagnosticHoverSource), tsTagHoverMarkers])
        const off = tsDiagnosticsSession(view, { lang: 'typescript', fileName, debounceMs: 1 })
        expect(await until(() => view.state.field(tsTagField).length > 0)).toBe(true)
        view.dispatch(view.state.update({ selection: EditorSelection.single(doc.indexOf('unused') + 2) }))
        expect(await showHover(view)).toBe(true)
        expect(view.dom.querySelector('.cm-tooltip-hover .cm-diagnostic-related')).toBeNull()
        off()
        done()
    }, SLOW)
})
