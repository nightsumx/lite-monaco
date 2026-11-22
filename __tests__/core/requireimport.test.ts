import { describe, expect, it } from 'vitest'
import { EditorState } from '../../src/core/model/state'
import { EditorSelection } from '../../src/core/model/selection'
import { convertRequireLine, convertRequireToImport, convertImportLine, convertImportToRequire } from '../../src/core/feature/requireimport'

describe('convertRequireLine', () => {
    it('默认导入和具名导入', () => {
        expect(convertRequireLine("const fs = require('fs')")).toBe("import fs from 'fs'")
        expect(convertRequireLine('const { a, b } = require("./m")')).toBe('import { a, b } from "./m"')
        expect(convertRequireLine('const x = 1')).toBeNull()
    })

    it('convertRequireToImport 改当前行', () => {
        let state = EditorState.create({
            doc: "const fs = require('fs')\n",
            selection: EditorSelection.single(0),
        })
        expect(convertRequireToImport({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe("import fs from 'fs'\n")
        expect(convertRequireToImport({ state, dispatch: tr => { state = tr.apply() } })).toBe(false)
    })

    it('import 转回 require', () => {
        expect(convertImportLine("import fs from 'fs'")).toBe("const fs = require('fs')")
        expect(convertImportLine('import { a, b } from "./m"')).toBe('const { a, b } = require("./m")')
        let state = EditorState.create({
            doc: "import fs from 'fs'\n",
            selection: EditorSelection.single(0),
        })
        expect(convertImportToRequire({ state, dispatch: tr => { state = tr.apply() } })).toBe(true)
        expect(state.doc.toString()).toBe("const fs = require('fs')\n")
    })
})
