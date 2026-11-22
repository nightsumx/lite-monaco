// platform/progress/common/progress:Progress<T>(report → 回调)与 Progress.None;测试夹具类型,不涉及被测行为。
export interface IProgress<T> { report(item: T): void }
export class Progress<T> implements IProgress<T> {
    static readonly None: IProgress<unknown> = Object.freeze({ report() { } })
    constructor(private callback: (data: T) => void) { }
    report(item: T) { this.callback(item) }
}
export const IEditorProgressService: any = undefined
