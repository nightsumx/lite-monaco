// 由 scripts/gen-monaco-types.ts 生成,勿手改(改 __tests__/types/monaco-types-gen.ts 的 MAP/生成逻辑)。
// monaco 顶层类型(`monaco.IDisposable` 等)。lite 已有的取 ../index,没有的按官方声明移植。
// 声明移植自 monaco-editor 0.55.1 的 monaco.d.ts(Microsoft, MIT);已有 lite-monaco 等价类型的名字直接映射到它。


import type { IDisposable, IEvent, CancellationToken, IPosition, IRange, ISelection, IKeyboardEvent, IMouseEvent, IScrollEvent, Uri, Position, Range, Selection, MarkerSeverity, MarkerTag, Token } from '../index'

export type { IDisposable, IEvent, CancellationToken, IPosition, IRange, ISelection, IKeyboardEvent, IMouseEvent, IScrollEvent, Uri, Position, Range, Selection, MarkerSeverity, MarkerTag, Token }

export type Thenable<T> = PromiseLike<T>;

export interface UriComponents {
    scheme: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
}

export interface IMarkdownString {
    readonly value: string;
    readonly isTrusted?: boolean | MarkdownStringTrustedOptions;
    readonly supportThemeIcons?: boolean;
    readonly supportHtml?: boolean;
    readonly baseUri?: UriComponents;
    uris?: {
        [href: string]: UriComponents;
    };
}

export interface MarkdownStringTrustedOptions {
    readonly enabledCommands: readonly string[];
}

export interface Environment {
    /**
     * Define a global `monaco` symbol.
     * This is true by default in AMD and false by default in ESM.
     */
    globalAPI?: boolean;
    /**
     * The base url where the editor sources are found (which contains the vs folder)
     */
    baseUrl?: string;
    /**
     * A web worker factory.
     * NOTE: If `getWorker` is defined, `getWorkerUrl` is not invoked.
     */
    getWorker?(workerId: string, label: string): Promise<Worker> | Worker;
    /**
     * Return the location for web worker scripts.
     * NOTE: If `getWorker` is defined, `getWorkerUrl` is not invoked.
     */
    getWorkerUrl?(workerId: string, label: string): string;
    /**
     * Create a trusted types policy (same API as window.trustedTypes.createPolicy)
     */
    createTrustedTypesPolicy?(
        policyName: string,
        policyOptions?: ITrustedTypePolicyOptions,
    ): undefined | ITrustedTypePolicy;
}

export interface ITrustedTypePolicyOptions {
    createHTML?: (input: string, ...args: any[]) => string;
    createScript?: (input: string, ...args: any[]) => string;
    createScriptURL?: (input: string, ...args: any[]) => string;
}

export interface ITrustedTypePolicy {
    readonly name: string;
    createHTML?(input: string): any;
    createScript?(input: string): any;
    createScriptURL?(input: string): any;
}

export interface IWebWorkerOptions {
    /**
     * The AMD moduleId to load.
     * It should export a function `create` that should return the exported proxy.
     */
    moduleId: string;
    createWorker?: () => Worker;
    /**
     * The data to send over when calling create on the module.
     */
    createData?: any;
    /**
     * A label to be used to identify the web worker for debugging purposes.
     */
    label?: string;
    /**
     * An object that can be used by the web worker to make calls back to the main thread.
     */
    host?: any;
    /**
     * Keep idle models.
     * Defaults to false, which means that idle models will stop syncing after a while.
     */
    keepIdleModels?: boolean;
}
