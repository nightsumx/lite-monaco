// 左: Monaco DiffEditor(真源对照)  右: lite-monaco DiffEditor。两边都用默认字体和 advanced diff 算法。
import { createHighlighter } from 'shiki'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { DiffEditor } from '../src/index'

;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker() {
        return new editorWorker()
    },
}

const ORIGINAL = `export function greet(name: string) {
  console.log("hi", name)
  return name
}

export const version = 1
export function unused() {
  return 0
}
`

const MODIFIED = `export function greet(name: string, shout = false) {
  const msg = shout ? name.toUpperCase() : name
  console.log("hello", msg)
  return msg
}

export const version = 2
export const build = "dev"
`

const status = document.getElementById('status')!
const hl = await createHighlighter({ themes: ['dark-plus'], langs: ['typescript'] })

// plaintext:不拉 TS worker,只比 diff 和外观
const originalModel = monaco.editor.createModel(ORIGINAL, 'plaintext')
const modifiedModel = monaco.editor.createModel(MODIFIED, 'plaintext')
const monacoDiff = monaco.editor.createDiffEditor(document.getElementById('monaco-host')!, {
    automaticLayout: true,
    theme: 'vs-dark',
    minimap: { enabled: false },
})
monacoDiff.setModel({ original: originalModel, modified: modifiedModel })

const litDiff = new DiffEditor({
    parent: document.getElementById('lite-monaco-host')!,
    highlighter: hl,
    lang: 'typescript',
    theme: 'dark-plus',
    original: ORIGINAL,
    modified: MODIFIED,
})

const report = (tag: string) => {
    setTimeout(() => {
        status.textContent = `${tag} · lit=${litDiff.getMappings().length} · monaco=${monacoDiff.getLineChanges()?.length ?? '?'}`
    }, 400)
}
report('ready')

document.getElementById('sample')!.onclick = () => {
    originalModel.setValue(ORIGINAL)
    modifiedModel.setValue(MODIFIED)
    litDiff.setModels(ORIGINAL, MODIFIED)
    report('reset')
}

document.getElementById('edit-right')!.onclick = () => {
    modifiedModel.applyEdits([{ range: new monaco.Range(1, 1, 1, 1), text: '// patched\n' }])
    litDiff.modifiedView.dispatch(litDiff.modifiedView.state.update({ changes: { from: 0, insert: '// patched\n' } }))
    report('edit')
}

Object.assign(window, { monacoDiff, litDiff, hl })
