// Monaco LineCommentCommand(langConfigService, sel, indentSize, type, insertSpace, ignoreEmptyLines, ignoreFirstLine) → lite-monaco
// editor.action.commentLine / addCommentLine / removeCommentLine。indentSize 是 model 选项,insertSpace / ignoreEmptyLines 是编辑器选项 comments.*。
// 静态内部函数(_analyzeLines / _normalizeInsertionPoint)转到 src/core/edit/comment.ts 导出的同名纯函数。
import { lmCommand } from './testCommand'
import { analyzeLines, normalizeInsertionPoint } from '../../src/core/edit/comment'

export const enum Type { Toggle = 0, ForceAdd = 1, ForceRemove = 2 }
export interface ILinePreflightData { ignore: boolean, commentStr: string, commentStrOffset: number, commentStrLength: number }
export type IPreflightData = any
export interface ISimpleModel { getLineContent(lineNumber: number): string }

const ACTIONS = ['editor.action.commentLine', 'editor.action.addCommentLine', 'editor.action.removeCommentLine']
const TYPES = ['toggle', 'add', 'remove'] as const

export class LineCommentCommand {
    constructor(_svc: unknown, _sel: unknown, indentSize: number, type: number, insertSpace: boolean, ignoreEmptyLines: boolean, _ignoreFirstLine?: boolean) {
        return lmCommand((editor, model) => {
            model.updateOptions({ indentSize, tabSize: indentSize })
            editor.updateOptions({ comments: { insertSpace, ignoreEmptyLines } })
            editor.getAction(ACTIONS[type])!.run()
        }) as never
    }
    static _analyzeLines(type: number, insertSpace: boolean, model: ISimpleModel, lines: ILinePreflightData[], startLineNumber: number, ignoreEmptyLines: boolean, ignoreFirstLine: boolean, languageConfigurationService: any, languageId: string): IPreflightData {
        const cfg = languageConfigurationService.getLanguageConfiguration(languageId).comments?.lineComment
        const noIndent = typeof cfg === 'object' && cfg !== null ? !!cfg.noIndent : false
        return analyzeLines(TYPES[type], insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, noIndent)
    }
    static _normalizeInsertionPoint(model: ISimpleModel, lines: { ignore: boolean, commentStrOffset: number }[], startLineNumber: number, indentSize: number) {
        normalizeInsertionPoint(model, lines, startLineNumber, indentSize)
    }
}
