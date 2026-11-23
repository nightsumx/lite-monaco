// B:官方 @monaco-editor/react 4.7.0 + lite-monaco(loader.config({ monaco }) 这条路)
import * as monaco from '../../../src/index'
import Editor, { DiffEditor, useMonaco, loader } from '@monaco-editor/react'
import { installReact } from './harness'
loader.config({ monaco: monaco as never })
;(window as any).__loader = loader
installReact('B', { Editor, DiffEditor, useMonaco, loader, monaco })
