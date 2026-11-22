// diff 编辑器:真 Monaco 0.55.1 vs lite-monaco。diff 的公共 API(getLineChanges/两侧 layout/scroll/选项)+ DOM 探针(同名 class,几何)
// 场景用 scn.diff 描述(original/modified/language/options/width/height);harness 里 editor = modified 一侧
const L = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n')
const base = L(60, i => `line ${i} of the original text`)
const mod = (() => {
    const a = base.split('\n')
    a[4] = 'line 5 of the CHANGED text'
    a.splice(10, 0, 'inserted A', 'inserted B')
    a.splice(30, 3)
    a[40] = '    line 41 of the original text' // 只有缩进
    a[50] = 'line 51 of the original text   ' // 只有尾空白
    return a.join('\n')
})()
const SEL = {
    lineIns: { both: '.line-insert' }, lineDel: { both: '.line-delete' }, charIns: { both: '.char-insert' }, charDel: { both: '.char-delete' },
    gIns: { both: '.gutter-insert' }, gDel: { both: '.gutter-delete' }, hidden: { both: '.diff-hidden-lines' },
}
const P = (extra = {}) => ({ do: 'snap', label: extra.label ?? 'p', spec: { geometry: false, cursor: false, value: false, diff: { layout: true, scroll: true, count: SEL, ...extra.diff }, ...(extra.spec ?? {}) } })
const D = (name, diff, steps = [], extra = {}) => ({ name, diff: { original: base, modified: mod, width: 1000, height: 400, ...diff }, steps: [{ do: 'wait', ms: 200 }, P({ label: 'init' }), ...steps], ...extra })
export default [
    D('side-by-side', { options: { renderSideBySide: true } }),
    D('inline', { options: { renderSideBySide: false } }),
    D('auto-inline-narrow', { width: 800, options: { renderSideBySide: true } }),
    D('auto-inline-off', { width: 800, options: { renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false } }),
    D('breakpoint-1200', { width: 1000, options: { renderSideBySide: true, renderSideBySideInlineBreakpoint: 1200 } }),
    D('ignoreTrim-false', { options: { ignoreTrimWhitespace: false } }),
    D('ignoreTrim-true', { options: { ignoreTrimWhitespace: true } }),
    D('toggle-sbs', {}, [
        { do: 'eval', code: 'diff.updateOptions({renderSideBySide:false})' }, P({ label: 'inline' }),
        { do: 'eval', code: 'diff.updateOptions({renderSideBySide:true})' }, P({ label: 'sbs' }),
    ]),
    D('toggle-ignoreTrim', {}, [
        { do: 'eval', code: 'diff.updateOptions({ignoreTrimWhitespace:false}); await diff.waitForDiff?.()' }, { do: 'wait', ms: 400 }, P({ label: 'off' }),
        { do: 'eval', code: 'diff.updateOptions({ignoreTrimWhitespace:true})' }, { do: 'wait', ms: 400 }, P({ label: 'on' }),
    ]),
    D('indicators-off', { options: { renderIndicators: false } }),
    D('overview-off', { options: { renderOverviewRuler: false } }),
    D('legacy-algo', { options: { diffAlgorithm: 'legacy' } }),
    D('lineNumbers-off', { options: { lineNumbers: 'off' } }),
    D('hide-unchanged', { options: { hideUnchangedRegions: { enabled: true, minimumLineCount: 3, contextLineCount: 2, revealLineCount: 10 } } }, [
        P({ label: 'collapsed', diff: { text: { hid: { both: '.diff-hidden-lines' } } } }),
    ]),
    D('hide-unchanged-inline', { options: { renderSideBySide: false, hideUnchangedRegions: { enabled: true, minimumLineCount: 3, contextLineCount: 2, revealLineCount: 10 } } }, [
        P({ label: 'collapsed', diff: { text: { hid: { both: '.diff-hidden-lines' } } } }),
    ]),
    D('hide-unchanged-expand', { options: { hideUnchangedRegions: { enabled: true, minimumLineCount: 3, contextLineCount: 2, revealLineCount: 10 } } }, [
        { do: 'eval', code: 'diff.showAllUnchangedRegions?.()' }, { do: 'wait', ms: 300 }, P({ label: 'all' }),
        { do: 'eval', code: 'diff.collapseAllUnchangedRegions?.()' }, { do: 'wait', ms: 300 }, P({ label: 'collapsed-again' }),
    ]),
    D('goto-diff', {}, [
        { do: 'eval', code: 'diff.goToDiff("next")' }, { do: 'wait', ms: 300 }, P({ label: 'n1', diff: { sel: true, visible: true } }),
        { do: 'eval', code: 'diff.goToDiff("next")' }, { do: 'wait', ms: 300 }, P({ label: 'n2', diff: { sel: true, visible: true } }),
        { do: 'eval', code: 'diff.goToDiff("previous")' }, { do: 'wait', ms: 300 }, P({ label: 'p1', diff: { sel: true, visible: true } }),
    ]),
    D('revealFirstDiff', { height: 200 }, [{ do: 'eval', code: 'diff.revealFirstDiff()' }, { do: 'wait', ms: 300 }, P({ label: 'rev', diff: { sel: true, visible: true } })]),
    D('readonly-defaults', {}, [P({ label: 'ro', diff: { readOnly: true } })]),
    D('originalEditable', { options: { originalEditable: true } }, [P({ label: 'ro', diff: { readOnly: true } })]),
    D('readOnly-true', { options: { readOnly: true } }, [P({ label: 'ro', diff: { readOnly: true } })]),
    D('scroll-sync', {}, [
        { do: 'eval', code: 'diff.getModifiedEditor().setScrollTop(300)' }, { do: 'wait', ms: 200 }, P({ label: 'mod300' }),
        { do: 'eval', code: 'diff.getOriginalEditor().setScrollTop(120)' }, { do: 'wait', ms: 200 }, P({ label: 'orig120' }),
    ]),
    D('scroll-sync-inline', { options: { renderSideBySide: false } }, [
        { do: 'eval', code: 'diff.getModifiedEditor().setScrollTop(300)' }, { do: 'wait', ms: 200 }, P({ label: 'mod300' }),
    ]),
    D('edit-modified', {}, [
        { do: 'eval', code: 'diff.getModifiedEditor().setPosition({lineNumber:2,column:1}); diff.getModifiedEditor().focus()' },
        { do: 'type', text: 'XYZ ' }, { do: 'wait', ms: 700 }, P({ label: 'typed' }),
        { do: 'keys', keys: ['Meta+z'] }, { do: 'wait', ms: 700 }, P({ label: 'undo' }),
    ]),
    D('edit-original', { options: { originalEditable: true } }, [
        { do: 'eval', code: 'const o=diff.getOriginalEditor(); o.setPosition({lineNumber:6,column:1}); o.focus(); o.trigger("t","type",{text:"Q "})' }, { do: 'wait', ms: 700 }, P({ label: 'typed' }),
    ]),
    D('identical', { original: 'same\ntext', modified: 'same\ntext' }),
    D('empty-vs-text', { original: '', modified: 'hello\nworld' }),
    D('text-vs-empty', { original: 'hello\nworld', modified: '' }),
    D('wordwrap', { original: 'short\n' + 'word '.repeat(80) + '\nend', modified: 'short\n' + 'word '.repeat(80) + 'X\nend', options: { wordWrap: 'on' } }, [P({ label: 'ww', spec: { rows: 'all' } })]),
    D('wordwrap-inline', { original: 'short\n' + 'word '.repeat(80) + '\nend', modified: 'short\n' + 'word '.repeat(80) + 'X\nend', options: { wordWrap: 'on', renderSideBySide: false } }, [P({ label: 'ww', spec: { rows: 'all' } })]),
    D('char-diff-words', { original: 'const foo = bar(1, 2)\nlet x = 1', modified: 'const foo2 = baz(1, 22)\nlet x = 10' }),
    D('moved-code', { original: L(20, i => `function f${i}() { return ${i} }`), modified: [...L(20, i => `function f${i}() { return ${i} }`).split('\n').slice(10), ...L(20, i => `function f${i}() { return ${i} }`).split('\n').slice(0, 10)].join('\n'), options: { experimental: { showMoves: true } } }),
    D('sash-drag', { options: { enableSplitViewResizing: true } }, [
        { do: 'eval', code: 'const r=document.querySelector(".monaco-sash.vertical, .diff-sash"); const b=r.getBoundingClientRect(); return [b.left,b.top,b.width,b.height]', label: 'sash' },
    ]),
    D('resize', {}, [{ do: 'resize', w: 600, h: 300 }, P({ label: 'small' }), { do: 'resize', w: 1000, h: 400 }, P({ label: 'big' })]),
    D('onlyShowAccessibleDiffViewer', { options: { onlyShowAccessibleDiffViewer: true } }, [P({ label: 'acc', diff: { count: { ...SEL, acc: { both: '.accessibleDiffViewer' } } } })]),
    D('ts-lang', { language: 'typescript', original: 'function a(x: number) {\n  return x + 1\n}\n', modified: 'function a(x: number, y = 2) {\n  const z = x + y\n  return z\n}\n' }),
    D('compact', { options: { compactMode: true } }),
    D('renderGutterMenu-off', { options: { renderGutterMenu: false } }),
    D('renderMarginRevertIcon-off', { options: { renderMarginRevertIcon: false } }),
    D('glyphMargin', { options: { glyphMargin: true } }),
    D('folding-on', { options: { folding: true } }),
]
