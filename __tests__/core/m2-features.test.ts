import { describe, expect, it } from 'vitest'
import { computeStickyLines, leadingIndent, stickyScrollOverlay } from '../../src/core/feature/stickyscroll'
import { codeActionsFromFixes, collectCodeActionsAt, runCodeActionsMenu } from '../../src/lang/tscodeactions'
import { lineDiff, splitLinesDiff, sideBySideRows } from '../../src/core/diff/linediff'

import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { clearTSServiceCache } from '../../src/lang/tsservice'
import { EditorView } from '../../src/core/view/editorview'
import { a11ySession, announce, applyEditorA11y } from '../../src/core/feature/a11y'
import { diagnosticsField, setDiagnostics } from '../../src/core/feature/diagnostics'

describe('leadingIndent / sticky', () => {
    it('leadingIndent 计空格与 tab', () => {
        expect(leadingIndent('  foo')).toBe(2)
        expect(leadingIndent('\tbar')).toBe(1)
        expect(leadingIndent('x')).toBe(0)
    })

    it('computeStickyLines 取更浅缩进祖先行', () => {
        const text = [
            'function outer() {',
            '  if (true) {',
            '    const x = 1',
            '    const y = 2',
            '  }',
            '}',
        ].join('\n')
        const doc = EditorState.create({ doc: text }).doc
        // viewport 从第 4 行(1-based)起 → 看 1..3,缩进逐级变浅
        const lines = computeStickyLines(doc, 4, 5)
        expect(lines.map(l => l.line)).toEqual([1, 2, 3])
        expect(lines[0].text).toContain('function outer')
        expect(lines[1].text).toContain('if (true)')
        expect(lines[2].text).toContain('const x')
    })

    it('视口从第 1 行起没有 sticky；maxLines 截断', () => {
        const doc = EditorState.create({
            doc: 'a\n  b\n    c\n      d\n        e',
        }).doc
        expect(computeStickyLines(doc, 1)).toEqual([])
        const capped = computeStickyLines(doc, 5, 2)
        expect(capped.length).toBe(2)
        expect(capped[0].line).toBeLessThan(capped[1].line)
    })

    it('sticky overlay 按 scrollTop 画出作用域行，点击跳到该行', async () => {
        const text = [
            'function outer() {',
            '  if (true) {',
            '    const x = 1',
            '    const y = 2',
            '    const z = 3',
            '  }',
            '}',
        ].join('\n')
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: text }),
            parent,
        })
        // F6:overlay 按 scrollTop(scrollDOM 与 contentDOM 的相对位置)选作用域,不再读 viewportStartLine
        const lh = view.oracle.lineHeight || 20
        view.scrollDOM.getBoundingClientRect = () => ({ top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
        view.contentDOM.getBoundingClientRect = () => ({ top: -lh * 1.5, left: 0, right: 600, bottom: 300, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
        const off = stickyScrollOverlay(view)
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        const rows = [...view.dom.querySelectorAll('.cm-sticky-line')]
        expect(rows.length).toBeGreaterThan(0)
        expect(rows[0].textContent).toContain('function outer')
        expect(rows.some(r => r.textContent?.includes('if (true)'))).toBe(true)
        off()
        view.destroy()
        parent.remove()
    })
})

describe('lineDiff M2.4 base', () => {
    it('splitLinesDiff', () => {
        expect(splitLinesDiff('a\nb\n')).toEqual(['a', 'b', ''])
    })

    it('equal / insert / delete', () => {
        const ops = lineDiff('a\nb\nc', 'a\nx\nc')
        expect(ops.some(o => o.type === 'equal' && o.lines.includes('a'))).toBe(true)
        expect(ops.some(o => o.type === 'delete' && o.lines.includes('b'))).toBe(true)
        expect(ops.some(o => o.type === 'insert' && o.lines.includes('x'))).toBe(true)
        const rows = sideBySideRows(ops)
        expect(rows.some(r => r.kind === 'delete' && r.left === 'b')).toBe(true)
        expect(rows.some(r => r.kind === 'insert' && r.right === 'x')).toBe(true)
    })
})

describe('codeActionsFromFixes', () => {
    it('只收主文件 edits', () => {
        const items = codeActionsFromFixes([
            {
                fixName: 'fix',
                description: 'fix it',
                changes: [
                    {
                        fileName: '/main.ts',
                        textChanges: [{ span: { start: 0, length: 1 }, newText: 'Z' }],
                    },
                    {
                        fileName: '/other.ts',
                        textChanges: [{ span: { start: 0, length: 1 }, newText: 'X' }],
                    },
                ],
            } as unknown as import('typescript').CodeFixAction,
        ], '/main.ts')
        expect(items).toHaveLength(1)
        expect(items[0].edits).toHaveLength(1)
        expect(items[0].edits[0].newText).toBe('Z')
    })

    it('runCodeActionsMenu 只读或无 fix 返 false', async () => {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const ro = new EditorView({
            state: EditorState.create({
                doc: 'const x = 1',
                extensions: [EditorState.readOnly.of(true)],
            }),
            parent: host,
        })
        expect(await runCodeActionsMenu(ro, { lang: 'typescript', fileName: '/ro.ts' })).toBe(false)
        ro.destroy()
        const empty = new EditorView({
            state: EditorState.create({ doc: 'const x = 1' }),
            parent: host,
        })
        expect(await runCodeActionsMenu(empty, { lang: 'typescript', fileName: '/ok.ts' })).toBe(false)
        empty.destroy()
        host.remove()
    })

    it('两个未用变量能收集 Fix all', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'const unusedA = 1\nconst unusedB = 2\nexport const ok = 3\n'
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(6),
            }),
            parent: host,
        })
        const items = await collectCodeActionsAt(view, {
            lang: 'typescript',
            fileName: '/fixall.ts',
            compilerOptions: { noUnusedLocals: true },
        })
        expect(items.some(it => /fix all/i.test(it.description))).toBe(true)
        view.destroy()
        host.remove()
    }, 60_000)

    it('选中表达式能收集 Extract 重构', async () => {
        clearTSServiceCache()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const doc = 'function f() {\n  return 1 + 2\n}\n'
        const from = doc.indexOf('1 + 2')
        const view = new EditorView({
            state: EditorState.create({
                doc,
                selection: EditorSelection.single(from, from + 5),
            }),
            parent: host,
        })
        const items = await collectCodeActionsAt(view, { lang: 'typescript', fileName: '/ex.ts' })
        expect(items.some(it => /extract/i.test(it.description))).toBe(true)
        view.destroy()
        host.remove()
    }, 60_000)
})

describe('EditorView lineWrapping', () => {
    it('config 打开时 class + oracle 标志', () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'hello world long line' }),
            parent,
            lineWrapping: true,
        })
        expect(view.lineWrapping).toBe(true)
        expect(view.dom.classList.contains('cm-lineWrapping')).toBe(true)
        expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
        expect(view.oracle.lineWrapping).toBe(true)
        expect(view.lineWidthOracle.lineWrapping).toBe(true)
        view.destroy?.()
        parent.remove()
    })
})

describe('a11y', () => {
    it('applyEditorA11y 写 role；announce 进 live region', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'x' }),
            parent,
        })
        applyEditorA11y(view, { label: 'Main' })
        expect(view.contentDOM.getAttribute('role')).toBe('textbox')
        expect(view.contentDOM.getAttribute('aria-label')).toBe('Main')
        announce(view, 'Line 1')
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        const live = view.dom.querySelector('[data-cm-a11y-live]')
        expect(live).not.toBeNull()
        expect(live!.textContent).toBe('Line 1')
        view.destroy()
        parent.remove()
    })

    it('a11ySession 诊断写入后播报 error 数', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({
                doc: 'x',
                extensions: [diagnosticsField],
            }),
            parent,
        })
        const off = a11ySession(view)
        view.dispatch(view.state.update({
            effects: setDiagnostics.of([
                { from: 0, to: 1, severity: 'error', message: 'bad' },
            ]),
        }))
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        const live = view.dom.querySelector('[data-cm-a11y-live]')
        expect(live?.textContent).toMatch(/1 error/)
        off()
        view.destroy()
        parent.remove()
    })

    it('a11ySession 写自定义 label；选区变化后播报行号', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const view = new EditorView({
            state: EditorState.create({ doc: 'ab\ncd' }),
            parent,
        })
        const off = a11ySession(view, { label: 'QA editor' })
        expect(view.contentDOM.getAttribute('aria-label')).toBe('QA editor')
        view.dispatch(view.state.update({ selection: { anchor: 4 } }))
        await new Promise(r => setTimeout(r, 450))
        const live = view.dom.querySelector('[data-cm-a11y-live]')
        expect(live?.textContent).toMatch(/Line 2/)
        off()
        view.destroy()

        const quiet = new EditorView({
            state: EditorState.create({ doc: 'ab\ncd' }),
            parent,
        })
        const offQ = a11ySession(quiet, { announceSelection: false })
        quiet.dispatch(quiet.state.update({ selection: { anchor: 4 } }))
        await new Promise(r => setTimeout(r, 450))
        const liveQ = quiet.dom.querySelector('[data-cm-a11y-live]')
        expect(liveQ?.textContent ?? '').not.toMatch(/Line 2/)
        offQ()
        quiet.destroy()
        parent.remove()
    })
})


