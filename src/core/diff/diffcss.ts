// Diff 编辑器新增部分的样式:折叠未改区域、移动块、行内视图、无障碍查看器。
// 选择器和数值照 Monaco 0.52 diffEditor/style.css、accessibleDiffViewer.css;只把 .monaco-editor 换成本仓库的容器。
// 主题里没有的颜色(unchangedRegion*、move.border…)带 Monaco 深色主题的默认值兜底。

export function diffExtraCSS(v: (key: string) => string): string {
    return `
/* ---------- useTrueInlineView:删除的文字画在修改侧原位 ---------- */
.monaco-diff-editor .inline-deleted-text { background-color: ${v('diffEditor.removedTextBackground')}; text-decoration: line-through; }
/* ---------- 折叠未改区域 ---------- */
.monaco-diff-editor .diff-hidden-lines-widget { display: block; width: 100%; overflow: visible; }
.cm-diffBlockLayer { position: absolute; top: 0; left: 0; width: 100%; height: 0; pointer-events: none; overflow: visible; }
.cm-diffBlockLayer > * { pointer-events: auto; }
.monaco-diff-editor .diff-hidden-lines { height: 0px; transform: translate(0px, -10px); font-size: 13px; line-height: 14px; }
.monaco-diff-editor .diff-hidden-lines:not(.dragging) .top:hover,
.monaco-diff-editor .diff-hidden-lines:not(.dragging) .bottom:hover,
.monaco-diff-editor .diff-hidden-lines .top.dragging,
.monaco-diff-editor .diff-hidden-lines .bottom.dragging { background-color: ${v('focusBorder')}; }
.monaco-diff-editor .diff-hidden-lines .top,
.monaco-diff-editor .diff-hidden-lines .bottom {
  transition: background-color 0.1s ease-out; height: 4px; background-color: transparent; background-clip: padding-box;
  border-bottom: 2px solid transparent; border-top: 4px solid transparent;
}
.monaco-diff-editor.draggingUnchangedRegion.canMoveTop:not(.canMoveBottom) *,
.monaco-diff-editor .diff-hidden-lines .top.canMoveTop:not(.canMoveBottom),
.monaco-diff-editor .diff-hidden-lines .bottom.canMoveTop:not(.canMoveBottom) { cursor: n-resize !important; }
.monaco-diff-editor.draggingUnchangedRegion:not(.canMoveTop).canMoveBottom *,
.monaco-diff-editor .diff-hidden-lines .top:not(.canMoveTop).canMoveBottom,
.monaco-diff-editor .diff-hidden-lines .bottom:not(.canMoveTop).canMoveBottom { cursor: s-resize !important; }
.monaco-diff-editor.draggingUnchangedRegion.canMoveTop.canMoveBottom *,
.monaco-diff-editor .diff-hidden-lines .top.canMoveTop.canMoveBottom,
.monaco-diff-editor .diff-hidden-lines .bottom.canMoveTop.canMoveBottom { cursor: ns-resize !important; }
.monaco-diff-editor .diff-hidden-lines .top { transform: translate(0px, 4px); }
.monaco-diff-editor .diff-hidden-lines .bottom { transform: translate(0px, -6px); }
.monaco-diff-editor .diff-hidden-lines .center {
  background: ${v('diffEditor.unchangedRegionBackground')};
  color: ${v('diffEditor.unchangedRegionForeground')};
  overflow: hidden; display: block; text-overflow: ellipsis; white-space: nowrap; height: 24px;
  box-shadow: inset 0 -5px 5px -7px ${v('diffEditor.unchangedRegionShadow')}, inset 0 5px 5px -7px ${v('diffEditor.unchangedRegionShadow')};
}
.monaco-diff-editor .diff-hidden-lines .center .codicon { vertical-align: middle; }
.monaco-diff-editor .diff-hidden-lines .center a:hover .codicon { cursor: pointer; color: ${v('editorLink.activeForeground')} !important; }
.monaco-diff-editor .diff-hidden-lines div.breadcrumb-item { cursor: pointer; }
.monaco-diff-editor .diff-hidden-lines div.breadcrumb-item:hover { color: ${v('editorLink.activeForeground')}; }
.monaco-diff-editor .cm-line.diff-unchanged-lines { background: ${v('diffEditor.unchangedCodeBackground')}; }
.monaco-diff-editor .fold-unchanged { cursor: pointer; }
.monaco-diff-editor .diff-hidden-lines-compact { display: flex; height: 11px; }
.monaco-diff-editor .diff-hidden-lines-compact .line-left,
.monaco-diff-editor .diff-hidden-lines-compact .line-right { height: 1px; border-top: 1px solid; border-color: ${v('editorCodeLens.foreground')}; opacity: 0.5; margin: auto; width: 100%; }
.monaco-diff-editor .diff-hidden-lines-compact .line-left { width: 20px; }
.monaco-diff-editor .diff-hidden-lines-compact .text { color: ${v('editorCodeLens.foreground')}; text-wrap: nowrap; font-size: 11px; line-height: 11px; margin: 0 4px; }

/* ---------- 移动的代码块 ---------- */
.monaco-diff-editor .cm-line.movedOriginal, .monaco-diff-editor .cm-line.movedModified {
  border-left: 2px solid ${v('diffEditor.move.border')}; border-right: 2px solid ${v('diffEditor.move.border')};
}
.monaco-diff-editor .cm-line.movedOriginal.moved-first, .monaco-diff-editor .cm-line.movedModified.moved-first { border-top: 2px solid ${v('diffEditor.move.border')}; }
.monaco-diff-editor .cm-line.movedOriginal.moved-last, .monaco-diff-editor .cm-line.movedModified.moved-last { border-bottom: 2px solid ${v('diffEditor.move.border')}; }
.monaco-diff-editor .cm-line.currentMove { border-color: ${v('diffEditor.moveActive.border')}; }
.monaco-diff-editor .moved-blocks-lines { position: absolute; top: 0; pointer-events: none; z-index: 8; }
.monaco-diff-editor .moved-blocks-lines path { fill: none; stroke: ${v('diffEditor.move.border')}; stroke-width: 2; pointer-events: visiblestroke; }
.monaco-diff-editor .moved-blocks-lines path.currentMove { stroke: ${v('diffEditor.moveActive.border')}; }
.monaco-diff-editor .moved-blocks-lines .arrow { fill: ${v('diffEditor.move.border')}; }
.monaco-diff-editor .moved-blocks-lines .arrow.currentMove { fill: ${v('diffEditor.moveActive.border')}; }
.monaco-diff-editor .moved-blocks-lines .arrow-rectangle { fill: ${v('editor.background')}; }
.monaco-diff-editor .diff-moved-code-block { display: flex; justify-content: flex-end; margin-top: -4px; font-size: 12px; }
.monaco-diff-editor .diff-moved-code-block .action-bar { display: flex; gap: 8px; align-items: center; }
.monaco-diff-editor .diff-moved-code-block .action-label { cursor: pointer; opacity: 0.85; }
.monaco-diff-editor .diff-moved-code-block .action-label.disabled { cursor: default; }
.monaco-diff-editor .diff-moved-code-block .action-label.checked { color: ${v('diffEditor.moveActive.border')}; opacity: 1; }
.monaco-diff-editor .diff-moved-code-block .action-label .codicon { font-size: 12px; vertical-align: middle; }

/* ---------- 行内(inline)视图 ---------- */
.monaco-diff-editor .inline-deleted-lines { width: 100%; }
.monaco-diff-editor .inline-deleted-line { position: relative; display: flex; white-space: pre; overflow: hidden; box-sizing: border-box; }
.monaco-diff-editor .inline-deleted-line.line-delete { background-color: ${v('diffEditor.removedLineBackground')}; }
.monaco-diff-editor .inline-deleted-margin-view-zone { display: inline-block; box-sizing: border-box; width: var(--diff-gutter-w); padding-right: 1.5ch; text-align: right; flex-shrink: 0; color: ${v('editorLineNumber.foreground')}; background-color: ${v('diffEditorGutter.removedLineBackground')}; }
.monaco-diff-editor .inline-deleted-line .delete-sign { position: absolute; left: calc(var(--diff-gutter-w) - 1.5ch); top: 0; height: 100%; display: flex; align-items: center; width: 1.5ch; font-size: 11px; opacity: 0.6; }
.monaco-diff-editor .inline-deleted-text-line { flex: 1; text-decoration: none; }
.monaco-diff-editor .inline-deleted-text-line .char-delete { background-color: ${v('diffEditor.removedTextBackground')}; text-decoration: line-through; }
.monaco-diff-editor .inline-deleted-text-line .char-delete.diff-range-empty { display: inline-block; width: 0; text-decoration: none; border-left: 3px solid ${v('diffEditor.removedTextBackground')}; }

/* ---------- 无障碍 diff 查看器 ---------- */
.monaco-diff-editor > .accessibleDiffViewer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 99; pointer-events: none; }
.monaco-diff-editor > .accessibleDiffViewer > .diff-review { pointer-events: auto; }
.monaco-component.diff-review { user-select: none; -webkit-user-select: none; z-index: 99; background: ${v('editor.background')}; color: ${v('editor.foreground')}; }
.monaco-diff-editor .diff-review { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; }
.monaco-diff-editor .diff-review .diff-review-content { width: 100%; height: 100%; overflow: auto; font: inherit; }
.monaco-component.diff-review .diff-review-line-number { text-align: right; display: inline-block; min-width: 4ch; color: ${v('editorLineNumber.foreground')}; }
.monaco-component.diff-review .diff-review-summary { padding-left: 10px; }
.monaco-component.diff-review .diff-review-row { white-space: pre; display: table-row; width: 100%; }
.monaco-component.diff-review .diff-review-row:focus { outline: 1px solid ${v('focusBorder')}; outline-offset: -1px; }
.monaco-component.diff-review .diff-review-row.line-insert { background-color: ${v('diffEditor.insertedLineBackground')}; }
.monaco-component.diff-review .diff-review-row.line-delete { background-color: ${v('diffEditor.removedLineBackground')}; }
.monaco-component.diff-review .diff-review-table { display: table; min-width: 100%; }
.monaco-component.diff-review .diff-review-spacer { display: inline-block; width: 10px; vertical-align: middle; }
.monaco-component.diff-review .diff-review-spacer > .codicon { font-size: 9px !important; }
.monaco-component.diff-review .diff-review-actions { display: inline-block; position: absolute; right: 10px; top: 2px; z-index: 100; }
.monaco-component.diff-review .diff-review-actions .action-label { display: inline-block; width: 16px; height: 16px; margin: 2px 0; cursor: pointer; }
`
}
