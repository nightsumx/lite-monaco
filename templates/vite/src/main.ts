// The whole setup: one import, no MonacoEnvironment, no worker loader.
import * as monaco from 'lite-monaco'

const value = `// This is lite-monaco: the monaco-editor API, half the size.
// Type checking comes from the optional \`typescript\` dependency.

interface User {
  name: string
  age: number
}

const user: User = { name: 'Ada', age: '36' } // type error: hover it

console.log(user.name.toUpperCase())
`

monaco.editor.create(document.getElementById('editor')!, {
  value,
  language: 'typescript',
  theme: 'vs-dark',
  automaticLayout: true,
  fontSize: 14,
  minimap: { enabled: false },
})
