// Monaco OutgoingViewModelEventKind:事件种类枚举(值与 Monaco 一致)。_viewModel.ts 的 onEvent 翻译用。
export enum OutgoingViewModelEventKind {
    ContentSizeChanged, FocusChanged, ScrollChanged, ViewZonesChanged, HiddenAreasChanged, ReadOnlyEditAttempt,
    CursorStateChanged, ModelDecorationsChanged, ModelLanguageChanged, ModelLanguageConfigurationChanged,
    ModelContentChanged, ModelOptionsChanged, ModelTokensChanged,
}
