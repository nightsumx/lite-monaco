// platform/theme/test/common/testThemeService:主题夹具(只存当前主题 + 变更事件;语义样式查询由主题对象给,这里的 TestColorTheme 没有 token 样式)。
import { Emitter } from '../../src/api/context'
import { ColorScheme } from './theme'

export class TestColorTheme {
    constructor(private readonly colors: Record<string, string> = {}, public type: ColorScheme = ColorScheme.DARK, public readonly semanticHighlighting = false) { }
    getColor(id: string) { return this.colors[id] }
    defines(id: string) { return Object.prototype.hasOwnProperty.call(this.colors, id) }
    getTokenStyleMetadata() { return undefined }
    tokenColorMap: string[] = []
}

export class TestThemeService {
    private _colorTheme: TestColorTheme
    private readonly _onChange = new Emitter<TestColorTheme>()
    readonly onDidColorThemeChange = this._onChange.event
    constructor(theme: TestColorTheme = new TestColorTheme()) { this._colorTheme = theme }
    getColorTheme() { return this._colorTheme }
    setTheme(theme: TestColorTheme) { this._colorTheme = theme; this.fireThemeChange() }
    fireThemeChange() { this._onChange.fire(this._colorTheme) }
}
