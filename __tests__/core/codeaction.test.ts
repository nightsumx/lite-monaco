import { describe, it, expect } from 'vitest'
import {
    registerCodeActionProvider, languageFeatures, getCodeActions, HierarchicalKind, CodeActionKind, CodeActionTriggerType, CodeActionTriggerSource,
} from '../../src/index'
import { createModel } from '../../src/api/model'

// languages.registerCodeActionProvider + getCodeActions:公开入口的端到端(协议细节由 parity 里的 Monaco 原版测试覆盖)
describe('registerCodeActionProvider', () => {
    it('注册后 getCodeActions 能取到;排序 = 带 diagnostics 的在前;kind 前缀过滤;disabled 只在 allActions', async () => {
        const model = createModel('a\nb', 'plaintext')
        const diag = [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2, message: 'm', severity: 8 }]
        const reg = registerCodeActionProvider('plaintext', {
            provideCodeActions: () => ({
                actions: [
                    { title: 'plain', kind: 'refactor.extract' },
                    { title: 'fix', kind: 'quickfix', diagnostics: diag },
                    { title: 'off', kind: 'quickfix', disabled: 'no' },
                ],
                dispose() { },
            }),
        })
        const set = await getCodeActions(languageFeatures.codeActionProvider, model as never, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            { type: CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, { report() { } }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) })
        expect(set.validActions.map(a => a.action.title)).toEqual(['fix', 'plain'])
        expect(set.allActions).toHaveLength(3)
        const onlyRefactor = await getCodeActions(languageFeatures.codeActionProvider, model as never, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
            { type: CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Refactor, filter: { include: CodeActionKind.Refactor } }, { report() { } }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) })
        expect(onlyRefactor.validActions.map(a => a.action.title)).toEqual(['plain'])
        reg.dispose()
        expect(languageFeatures.codeActionProvider.has(model as never)).toBe(false)
        model.dispose()
    })
    it('HierarchicalKind:前缀按 . 分段', () => {
        const a = new HierarchicalKind('refactor')
        expect(a.contains(new HierarchicalKind('refactor.extract'))).toBe(true)
        expect(a.contains(new HierarchicalKind('refactorx'))).toBe(false)
        expect(new HierarchicalKind('refactor.extract').intersects(a)).toBe(true)
    })
})
