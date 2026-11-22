// Monaco 公开枚举(数值与 monaco-editor 0.55.1 的 standaloneEnums.ts 逐项一致;来源 microsoft/vscode,MIT)。
// 只放 lite-monaco 其他位置没有定义的那批;内部用字符串字面量的选项仍用字符串,这里只给迁移代码用的数值枚举。

export enum AccessibilitySupport {
    /**
     * This should be the browser case where it is not known if a screen reader is attached or no.
     */
    Unknown = 0,
    Disabled = 1,
    Enabled = 2
}

export enum DocumentHighlightKind {
    /**
     * A textual occurrence.
     */
    Text = 0,
    /**
     * Read-access of a symbol, like reading a variable.
     */
    Read = 1,
    /**
     * Write-access of a symbol, like writing to a variable.
     */
    Write = 2
}

export enum EditorAutoIndentStrategy {
    None = 0,
    Keep = 1,
    Brackets = 2,
    Advanced = 3,
    Full = 4
}

export enum HoverVerbosityAction {
    /**
     * Increase the verbosity of the hover
     */
    Increase = 0,
    /**
     * Decrease the verbosity of the hover
     */
    Decrease = 1
}

export enum InjectedTextCursorStops {
    Both = 0,
    Right = 1,
    Left = 2,
    None = 3
}

export enum InlayHintKind {
    Type = 1,
    Parameter = 2
}

export enum NewSymbolNameTag {
    AIGenerated = 1
}

export enum NewSymbolNameTriggerKind {
    Invoke = 0,
    Automatic = 1
}

export enum RenderLineNumbersType {
    Off = 0,
    On = 1,
    Relative = 2,
    Interval = 3,
    Custom = 4
}

export enum RenderMinimap {
    None = 0,
    Text = 1,
    Blocks = 2
}

export enum ScrollbarVisibility {
    Auto = 1,
    Hidden = 2,
    Visible = 3
}

export enum ShowLightbulbIconMode {
    Off = 'off',
    OnCode = 'onCode',
    On = 'on'
}

export enum SymbolTag {
    Deprecated = 1
}

export enum TextDirection {
    LTR = 0,
    RTL = 1
}

export enum TextEditorCursorBlinkingStyle {
    /**
     * Hidden
     */
    Hidden = 0,
    /**
     * Blinking
     */
    Blink = 1,
    /**
     * Blinking with smooth fading
     */
    Smooth = 2,
    /**
     * Blinking with prolonged filled state and smooth fading
     */
    Phase = 3,
    /**
     * Expand collapse animation on the y axis
     */
    Expand = 4,
    /**
     * No-Blinking
     */
    Solid = 5
}

export enum TextEditorCursorStyle {
    /**
     * As a vertical line (sitting between two characters).
     */
    Line = 1,
    /**
     * As a block (sitting on top of a character).
     */
    Block = 2,
    /**
     * As a horizontal line (sitting under a character).
     */
    Underline = 3,
    /**
     * As a thin vertical line (sitting between two characters).
     */
    LineThin = 4,
    /**
     * As an outlined block (sitting on top of a character).
     */
    BlockOutline = 5,
    /**
     * As a thin horizontal line (sitting under a character).
     */
    UnderlineThin = 6
}

export enum WrappingIndent {
    /**
     * No indentation => wrapped lines begin at column 1.
     */
    None = 0,
    /**
     * Same => wrapped lines get the same indentation as the parent.
     */
    Same = 1,
    /**
     * Indent => wrapped lines get +1 indentation toward the parent.
     */
    Indent = 2,
    /**
     * DeepIndent => wrapped lines get +2 indentation toward the parent.
     */
    DeepIndent = 3
}

