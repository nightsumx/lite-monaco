// monaco.typescript(0.55 起的顶层命名空间;monaco.languages.typescript 是同一个对象,旧代码照用)。
// 枚举、类型声明移植自 monaco-editor 0.55.1 的 monaco.d.ts(Microsoft, MIT)。
//
// 没有的:getTypeScriptWorker / getJavaScriptWorker / typescriptVersion。Monaco 把所有 model 同步进 worker,
// 按 model 的 uri 查;lite-monaco 的 TS 项目只收挂在编辑器上的文件(按编辑器取名,不按 uri),
// 照样做出来会给出对不上的结果,所以不提供(见 MIGRATION.md)。

export { typescriptDefaults, javascriptDefaults } from '../lang/tsapi'
export type { LanguageServiceDefaults, DiagnosticsOptions, IExtraLibs, ModeConfiguration } from '../lang/tsapi'

export enum ModuleKind {
    None = 0,
    CommonJS = 1,
    AMD = 2,
    UMD = 3,
    System = 4,
    ES2015 = 5,
    ESNext = 99,
}
export enum JsxEmit {
    None = 0,
    Preserve = 1,
    React = 2,
    ReactNative = 3,
    ReactJSX = 4,
    ReactJSXDev = 5,
}
export enum NewLineKind {
    CarriageReturnLineFeed = 0,
    LineFeed = 1,
}
export enum ScriptTarget {
    ES3 = 0,
    ES5 = 1,
    ES2015 = 2,
    ES2016 = 3,
    ES2017 = 4,
    ES2018 = 5,
    ES2019 = 6,
    ES2020 = 7,
    ESNext = 99,
    JSON = 100,
    Latest = 99,
}
export enum ModuleResolutionKind {
    Classic = 1,
    NodeJs = 2,
}

// Monaco 的 CompilerOptions 用上面这几个枚举(不是 typescript 包的);数值相同,lite-monaco 照样收 typescript 包的写法
export interface MapLike<T> {
    [index: string]: T;
}
export type CompilerOptionsValue = string | number | boolean | (string | number)[] | string[] | MapLike<string[]> | null | undefined;
export interface CompilerOptions {
    allowJs?: boolean;
    allowSyntheticDefaultImports?: boolean;
    allowUmdGlobalAccess?: boolean;
    allowUnreachableCode?: boolean;
    allowUnusedLabels?: boolean;
    alwaysStrict?: boolean;
    baseUrl?: string;
    charset?: string;
    checkJs?: boolean;
    declaration?: boolean;
    declarationMap?: boolean;
    emitDeclarationOnly?: boolean;
    declarationDir?: string;
    disableSizeLimit?: boolean;
    disableSourceOfProjectReferenceRedirect?: boolean;
    downlevelIteration?: boolean;
    emitBOM?: boolean;
    emitDecoratorMetadata?: boolean;
    experimentalDecorators?: boolean;
    forceConsistentCasingInFileNames?: boolean;
    importHelpers?: boolean;
    inlineSourceMap?: boolean;
    inlineSources?: boolean;
    isolatedModules?: boolean;
    jsx?: JsxEmit;
    keyofStringsOnly?: boolean;
    lib?: string[];
    locale?: string;
    mapRoot?: string;
    maxNodeModuleJsDepth?: number;
    module?: ModuleKind;
    moduleResolution?: ModuleResolutionKind;
    newLine?: NewLineKind;
    noEmit?: boolean;
    noEmitHelpers?: boolean;
    noEmitOnError?: boolean;
    noErrorTruncation?: boolean;
    noFallthroughCasesInSwitch?: boolean;
    noImplicitAny?: boolean;
    noImplicitReturns?: boolean;
    noImplicitThis?: boolean;
    noStrictGenericChecks?: boolean;
    noUnusedLocals?: boolean;
    noUnusedParameters?: boolean;
    noImplicitUseStrict?: boolean;
    noLib?: boolean;
    noResolve?: boolean;
    out?: string;
    outDir?: string;
    outFile?: string;
    paths?: MapLike<string[]>;
    preserveConstEnums?: boolean;
    preserveSymlinks?: boolean;
    project?: string;
    reactNamespace?: string;
    jsxFactory?: string;
    composite?: boolean;
    removeComments?: boolean;
    rootDir?: string;
    rootDirs?: string[];
    skipLibCheck?: boolean;
    skipDefaultLibCheck?: boolean;
    sourceMap?: boolean;
    sourceRoot?: string;
    strict?: boolean;
    strictFunctionTypes?: boolean;
    strictBindCallApply?: boolean;
    strictNullChecks?: boolean;
    strictPropertyInitialization?: boolean;
    stripInternal?: boolean;
    suppressExcessPropertyErrors?: boolean;
    suppressImplicitAnyIndexErrors?: boolean;
    target?: ScriptTarget;
    traceResolution?: boolean;
    resolveJsonModule?: boolean;
    types?: string[];
    /** Paths used to compute primary types search locations */
    typeRoots?: string[];
    esModuleInterop?: boolean;
    useDefineForClassFields?: boolean;
    [option: string]: CompilerOptionsValue | undefined;
}
export interface WorkerOptions {
    /** A full HTTP path to a JavaScript file which adds a function `customTSWorkerFactory` to the self inside a web-worker */
    customWorkerPath?: string;
}
/**
 * A linked list of formatted diagnostic messages to be used as part of a multiline message.
 * It is built from the bottom up, leaving the head to be the "main" diagnostic.
 */
export interface DiagnosticMessageChain {
    messageText: string;
    /** Diagnostic category: warning = 0, error = 1, suggestion = 2, message = 3 */
    category: 0 | 1 | 2 | 3;
    code: number;
    next?: DiagnosticMessageChain[];
}
export interface Diagnostic extends DiagnosticRelatedInformation {
    /** May store more in future. For now, this will simply be `true` to indicate when a diagnostic is an unused-identifier diagnostic. */
    reportsUnnecessary?: {};
    reportsDeprecated?: {};
    source?: string;
    relatedInformation?: DiagnosticRelatedInformation[];
}
export interface DiagnosticRelatedInformation {
    /** Diagnostic category: warning = 0, error = 1, suggestion = 2, message = 3 */
    category: 0 | 1 | 2 | 3;
    code: number;
    /** TypeScriptWorker removes all but the `fileName` property to avoid serializing circular JSON structures. */
    file: {
        fileName: string;
    } | undefined;
    start: number | undefined;
    length: number | undefined;
    messageText: string | DiagnosticMessageChain;
}
export interface EmitOutput {
    outputFiles: OutputFile[];
    emitSkipped: boolean;
    diagnostics?: Diagnostic[];
}
export interface OutputFile {
    name: string;
    writeByteOrderMark: boolean;
    text: string;
}

export interface TypeScriptWorker {
    /**
     * Get diagnostic messages for any syntax issues in the given file.
     */
    getSyntacticDiagnostics(fileName: string): Promise<Diagnostic[]>;
    /**
     * Get diagnostic messages for any semantic issues in the given file.
     */
    getSemanticDiagnostics(fileName: string): Promise<Diagnostic[]>;
    /**
     * Get diagnostic messages for any suggestions related to the given file.
     */
    getSuggestionDiagnostics(fileName: string): Promise<Diagnostic[]>;
    /**
     * Get the content of a given file.
     */
    getScriptText(fileName: string): Promise<string | undefined>;
    /**
     * Get diagnostic messages related to the current compiler options.
     * @param fileName Not used
     */
    getCompilerOptionsDiagnostics(fileName: string): Promise<Diagnostic[]>;
    /**
     * Get code completions for the given file and position.
     * @returns `Promise<typescript.CompletionInfo | undefined>`
     */
    getCompletionsAtPosition(fileName: string, position: number): Promise<any | undefined>;
    /**
     * Get code completion details for the given file, position, and entry.
     * @returns `Promise<typescript.CompletionEntryDetails | undefined>`
     */
    getCompletionEntryDetails(fileName: string, position: number, entry: string): Promise<any | undefined>;
    /**
     * Get signature help items for the item at the given file and position.
     * @returns `Promise<typescript.SignatureHelpItems | undefined>`
     */
    getSignatureHelpItems(fileName: string, position: number, options: any): Promise<any | undefined>;
    /**
     * Get quick info for the item at the given position in the file.
     * @returns `Promise<typescript.QuickInfo | undefined>`
     */
    getQuickInfoAtPosition(fileName: string, position: number): Promise<any | undefined>;
    getDocumentHighlights(fileName: string, position: number, filesToSearch: string[]): Promise<ReadonlyArray<any> | undefined>;
    /**
     * Get the definition of the item at the given position in the file.
     * @returns `Promise<ReadonlyArray<typescript.DefinitionInfo> | undefined>`
     */
    getDefinitionAtPosition(fileName: string, position: number): Promise<ReadonlyArray<any> | undefined>;
    /**
     * Get references to the item at the given position in the file.
     * @returns `Promise<typescript.ReferenceEntry[] | undefined>`
     */
    getReferencesAtPosition(fileName: string, position: number): Promise<any[] | undefined>;
    /**
     * Get outline entries for the item at the given position in the file.
     * @returns `Promise<typescript.NavigationTree | undefined>`
     */
    getNavigationTree(fileName: string): Promise<any | undefined>;
    /**
     * Get changes which should be applied to format the given file.
     * @param options `typescript.FormatCodeOptions`
     * @returns `Promise<typescript.TextChange[]>`
     */
    getFormattingEditsForDocument(fileName: string, options: any): Promise<any[]>;
    /**
     * Get changes which should be applied to format the given range in the file.
     * @param options `typescript.FormatCodeOptions`
     * @returns `Promise<typescript.TextChange[]>`
     */
    getFormattingEditsForRange(fileName: string, start: number, end: number, options: any): Promise<any[]>;
    /**
     * Get formatting changes which should be applied after the given keystroke.
     * @param options `typescript.FormatCodeOptions`
     * @returns `Promise<typescript.TextChange[]>`
     */
    getFormattingEditsAfterKeystroke(fileName: string, postion: number, ch: string, options: any): Promise<any[]>;
    /**
     * Get other occurrences which should be updated when renaming the item at the given file and position.
     * @returns `Promise<readonly typescript.RenameLocation[] | undefined>`
     */
    findRenameLocations(fileName: string, positon: number, findInStrings: boolean, findInComments: boolean, providePrefixAndSuffixTextForRename: boolean): Promise<readonly any[] | undefined>;
    /**
     * Get edits which should be applied to rename the item at the given file and position (or a failure reason).
     * @param options `typescript.RenameInfoOptions`
     * @returns `Promise<typescript.RenameInfo>`
     */
    getRenameInfo(fileName: string, positon: number, options: any): Promise<any>;
    /**
     * Get transpiled output for the given file.
     * @returns `typescript.EmitOutput`
     */
    getEmitOutput(fileName: string, emitOnlyDtsFiles?: boolean, forceDtsEmit?: boolean): Promise<EmitOutput>;
    /**
     * Get possible code fixes at the given position in the file.
     * @param formatOptions `typescript.FormatCodeOptions`
     * @returns `Promise<ReadonlyArray<typescript.CodeFixAction>>`
     */
    getCodeFixesAtPosition(fileName: string, start: number, end: number, errorCodes: number[], formatOptions: any): Promise<ReadonlyArray<any>>;
    /**
     * Get inlay hints in the range of the file.
     * @param fileName
     * @returns `Promise<typescript.InlayHint[]>`
     */
    provideInlayHints(fileName: string, start: number, end: number): Promise<ReadonlyArray<any>>;
}
