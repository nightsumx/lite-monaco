// A:官方 @monaco-editor/react 4.7.0 + 真 monaco-editor 0.55.1(基准)
import * as monaco from '../../../node_modules/monaco-editor/esm/vs/editor/editor.main.js'
import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import { installReact } from './harness'
;(self as any).MonacoEnvironment = {
    getWorkerUrl(_id: string, label: string) {
        return `./${label === 'typescript' || label === 'javascript' ? 'ts' : label === 'json' ? 'json' : 'editor'}.worker.js`
    },
}
loader.config({ monaco })
;(window as any).__loader = loader
installReact('A', { Editor, DiffEditor, useMonaco, loader, monaco })
