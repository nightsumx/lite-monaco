// platform/keybinding/common/usLayoutResolvedKeybinding:测试里只当「被解析出来的键位」不透明对象(按引用比较)传递,保存 chords / os。
export class USLayoutResolvedKeybinding {
    constructor(readonly chords: readonly unknown[], readonly os: unknown) { }
}
