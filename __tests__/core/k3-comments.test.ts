// K3:comments.insertSpace / comments.ignoreEmptyLines
import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { editorOptions, type IEditorOptions } from '../../src/core/options'
import { toggleLineComment, toggleBlockComment } from '../../src/core/edit/comment'
import { commentTokensFacet } from '../../src/core/edit/commenttokens'

function run(doc: string, options: IEditorOptions, cmd: typeof toggleBlockComment, sel = EditorSelection.single(0, doc.length)) {
    let state = EditorState.create({ doc, selection: sel, extensions: [editorOptions.of(options), commentTokensFacet.of({ line: '//', block: { open: '/*', close: '*/' } })] })
    cmd({ state, dispatch: (tr: { apply(): EditorState }) => { state = tr.apply() } } as never)
    return state.doc.toString()
}
const line = toggleLineComment('//')

describe('comments.insertSpace', () => {
    it('默认 true:加 "// ",删时带走后面一个空格', () => {
        expect(run('a', {}, line)).toBe('// a')
        expect(run('// a', {}, line)).toBe('a')
    })
    it('false:加 "//" 不带空格;删时只删注释符', () => {
        expect(run('a', { comments: { insertSpace: false } }, line)).toBe('//a')
        expect(run('// a', { comments: { insertSpace: false } }, line)).toBe(' a')
    })
    it('块注释:false 时不加空格', () => {
        expect(run('a', {}, toggleBlockComment)).toBe('/* a */')
        expect(run('a', { comments: { insertSpace: false } }, toggleBlockComment)).toBe('/*a*/')
        expect(run('/* a */', {}, toggleBlockComment)).toBe('a')
        expect(run('/* a */', { comments: { insertSpace: false } }, toggleBlockComment)).toBe(' a ')
    })
})

describe('comments.ignoreEmptyLines', () => {
    it('默认 true:多行里的空行不加', () => {
        expect(run('a\n\nb', {}, line)).toBe('// a\n\n// b')
    })
    it('false:空行也加', () => {
        expect(run('a\n\nb', { comments: { ignoreEmptyLines: false } }, line)).toBe('// a\n// \n// b')
    })
})
