// InlineCompletionsController 的 DI 外壳 + 观察者适配。
// 行为都在 src/lang/inline/controller.ts / model.ts(命令式,onDidChange 通知);Monaco 测试把 model 当 observable 读
// (model.get() / state.read(reader) / primaryGhostText.read(reader)),这里用 Monaco 真实的 observable 库把 src 的 getter 包一层。只翻译,不实现行为。
import { InlineCompletionsController as Base } from '../../src/lang/inline/controller'
import { ghostTextOrReplacementEquals } from '../../src/lang/inline/ghosttext'
import type { InlineCompletionsModel as SrcModel } from '../../src/lang/inline/model'
import { derivedWithStore, observableFromEvent, observableFromEventOpts } from '../../../../reference/_vscode-src/src/vs/base/common/observable'
import { IInstantiationService } from './instantiation'
import { ILanguageFeaturesService } from './languageFeatures'

const OBSERVABLES: Record<string, { get(m: SrcModel): unknown, equalsFn?: (a: any, b: any) => boolean }> = {
    state: { get: m => m.state },
    primaryGhostText: { get: m => m.primaryGhostText, equalsFn: ghostTextOrReplacementEquals },
    ghostTexts: { get: m => m.ghostTexts },
    status: { get: m => m.status },
    inlineCompletionState: { get: m => m.inlineCompletionState },
    inlineEditState: { get: m => m.inlineEditState },
    inlineEditAvailable: { get: m => m.inlineEditAvailable },
    selectedInlineCompletion: { get: m => m.selectedInlineCompletion },
    selectedInlineCompletionIndex: { get: m => m.selectedInlineCompletionIndex },
}

/** src 的模型 + 上面那些 getter 的 observable 版本(其余成员原样透传) */
function observableModel(base: SrcModel): any {
    const cache = new Map<string, unknown>()
    return new Proxy(base, {
        get(t, k) {
            if (typeof k === 'string' && k in OBSERVABLES) {
                let o = cache.get(k)
                if (!o) {
                    const d = OBSERVABLES[k]
                    o = observableFromEventOpts({ owner: base, debugName: k, equalsFn: d.equalsFn }, t.onDidChange as never, () => d.get(t))
                    cache.set(k, o)
                }
                return o
            }
            if (k === 'debugGetSelectedSuggestItem') return () => observableFromEvent(base, t.onDidChange as never, () => t.debugSelectedSuggestItem())
            const v = Reflect.get(t, k, t)
            return typeof v === 'function' ? v.bind(t) : v
        },
    })
}

export class InlineCompletionsController extends Base {
    static override readonly ID = Base.ID
    static override get(editor: any): InlineCompletionsController | null { return Base.get(editor) as InlineCompletionsController | null }

    readonly model: any
    private readonly _wrapped = new WeakMap<object, unknown>()

    constructor(editor: any, inst?: any, _ctx?: unknown, _cfg?: unknown, _cmd?: unknown, _debounce?: unknown, languageFeatures?: any) {
        super(editor, languageFeatures ? { languageFeatures } : {})
        const wrap = (m: SrcModel | undefined) => m && (this._wrapped.get(m) ?? (this._wrapped.set(m, observableModel(m)), this._wrapped.get(m)))
        this.model = observableFromEvent(this, this.onDidChangeModel as never, () => wrap(super.model))
    }
}
IInstantiationService(InlineCompletionsController, undefined, 1)
ILanguageFeaturesService(InlineCompletionsController, undefined, 6)
void derivedWithStore
