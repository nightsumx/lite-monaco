import * as monaco from 'monaco-editor/esm/vs/editor/editor.main.js'
import { install } from './page.js'
self.MonacoEnvironment = { getWorker: (_, label) => new Worker(label === 'typescript' || label === 'javascript' ? 'ts.worker.js' : label === 'json' ? 'json.worker.js' : label === 'css' || label === 'scss' || label === 'less' ? 'css.worker.js' : label === 'html' ? 'html.worker.js' : 'editor.worker.js') }
window.monaco = monaco; install(monaco); window.__ready = performance.now()
