import * as monaco from '../../../node_modules/monaco-editor/esm/vs/editor/editor.main.js'
import { install } from './harness'
;(self as any).MonacoEnvironment = {
    getWorkerUrl(_id: string, label: string) {
        const f = label === 'css' || label === 'scss' || label === 'less' ? 'css'
            : label === 'html' || label === 'handlebars' || label === 'razor' ? 'html'
            : label === 'json' ? 'json' : label === 'typescript' || label === 'javascript' ? 'ts' : 'editor'
        return `./${f}.worker.js`
    },
}
install('monaco', monaco as never)
