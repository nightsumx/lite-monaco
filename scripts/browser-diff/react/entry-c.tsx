// C:lite-monaco 自带的 lite-monaco/react
import * as monaco from '../../../src/index'
import Editor, { DiffEditor, useMonaco, loader } from '../../../src/react/index'
import { installReact } from './harness'
;(window as any).__loader = loader
installReact('C', { Editor, DiffEditor, useMonaco, loader, monaco })
