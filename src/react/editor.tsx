'use client'
// <Editor>:对位 @monaco-editor/react 4.7.0 的 Editor(props、默认值、生效时机、onChange / onValidate 的触发条件都一样)。
// 不同的只有三处,都是它的毛病,改了不会让照它写的代码出错:
//   1. 不经过 loader:lite-monaco 是同步 import 的,编辑器在第一次绘制前就建好,没有「Loading...」那一帧。
//      和它一样在 display:none 的容器里建(`line` 因此落在顶上,不是最小滚动的底部),接着那次渲染就显示出来。
//   2. StrictMode 下同样只建一次,但留下的编辑器是活的(4.7 在 StrictMode 里拆掉以后不再建,4.8.0-rc 才修),见 useEditorLifetime。
//   3. 卸载时按最新的 path / keepCurrentModel / saveViewState 处理(它用的是第一次渲染时的值)。
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { MonacoContainer, getOrCreateModel, monaco, noop, useEditorLifetime, useLatest, usePrevious, useUpdate, type Monaco, type Theme } from './shared'

export type OnMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => void
export type BeforeMount = (monaco: Monaco) => void
export type OnChange = (value: string | undefined, ev: monaco.editor.IModelContentChangedEvent) => void
export type OnValidate = (markers: monaco.editor.IMarker[]) => void

export type EditorProps = {
    /** 当前 model 的初始内容 */
    defaultValue?: string
    /** 当前 model 的初始语言 */
    defaultLanguage?: string
    /** 当前 model 的初始路径,作为 `monaco.editor.createModel(…, …, monaco.Uri.parse(defaultPath))` 的第三个参数 */
    defaultPath?: string
    /** 当前 model 的内容(受控) */
    value?: string
    /** 当前 model 的语言 */
    language?: string
    /** 当前 model 的路径:换路径就换 model(没有就新建),各自的视图状态分开存 */
    path?: string
    /** 主题:'vs-dark' | 'light',或 defineTheme 定义的名字。@default "light" */
    theme?: Theme | string
    /** 滚到这一行 */
    line?: number
    /** 编辑器建好之前显示的东西。lite-monaco 同步建好,只有服务端渲染的 HTML 里看得到。@default "Loading..." */
    loading?: ReactNode
    options?: monaco.editor.IStandaloneEditorConstructionOptions
    overrideServices?: monaco.editor.IEditorOverrideServices
    /** 换 model 时存下、换回来时恢复视图状态(光标、滚动、折叠)。@default true */
    saveViewState?: boolean
    /** 卸载时留着当前 model(默认会 dispose 掉)。@default false */
    keepCurrentModel?: boolean
    /** 外层宽度。@default "100%" */
    width?: number | string
    /** 外层高度。@default "100%" */
    height?: number | string
    /** 编辑器容器的 class */
    className?: string
    /** 外层 <section> 的属性 */
    wrapperProps?: object
    /** 编辑器创建之前调用,参数是 monaco */
    beforeMount?: BeforeMount
    /** 编辑器创建之后调用,参数是编辑器和 monaco */
    onMount?: OnMount
    /** 用户改了内容时调用;value prop 引起的改动不调 */
    onChange?: OnChange
    /** 当前 model 的 markers 变了时调用 */
    onValidate?: OnValidate
}

/** 各 path 的视图状态,所有 <Editor> 共用(和 @monaco-editor/react 一样是模块级的) */
const viewStates = new Map<string | undefined, monaco.editor.ICodeEditorViewState | null>()

function Editor({
    defaultValue, defaultLanguage, defaultPath, value, language, path,
    theme = 'light', line, loading = 'Loading...', options = {}, overrideServices = {},
    saveViewState = true, keepCurrentModel = false,
    width = '100%', height = '100%', className, wrapperProps = {},
    beforeMount = noop, onMount = noop, onChange, onValidate = noop,
}: EditorProps) {
    const [isEditorReady, setIsEditorReady] = useState(false)
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    // 和 @monaco-editor/react 一样:onMount / beforeMount 取第一次渲染的
    const onMountRef = useRef(onMount)
    const beforeMountRef = useRef(beforeMount)
    const subscriptionRef = useRef<monaco.IDisposable | undefined>(undefined)
    const previousPath = usePrevious(path)
    const preventTriggerChangeEvent = useRef(false)
    const latest = useLatest({ path, keepCurrentModel, saveViewState })

    useEditorLifetime(() => {
        const container = containerRef.current
        if (!container) return
        beforeMountRef.current(monaco)
        const autoCreatedModelPath = path || defaultPath
        const model = getOrCreateModel(monaco, value || defaultValue || '', defaultLanguage || language || '', autoCreatedModelPath || '')
        const editor = monaco.editor.create(container, { model, automaticLayout: true, ...options }, overrideServices)
        if (saveViewState) editor.restoreViewState(viewStates.get(autoCreatedModelPath) ?? null)
        monaco.editor.setTheme(theme)
        if (line !== undefined) editor.revealLine(line)
        editorRef.current = editor
        setIsEditorReady(true)
        return () => {
            subscriptionRef.current?.dispose()
            subscriptionRef.current = undefined
            const now = latest.current
            if (now.keepCurrentModel) {
                if (now.saveViewState) viewStates.set(now.path, editor.saveViewState())
            }
            else editor.getModel()?.dispose()
            editor.dispose()
            editorRef.current = null
        }
    })

    useUpdate(() => {
        const editor = editorRef.current
        if (!editor) return
        const model = getOrCreateModel(monaco, defaultValue || value || '', defaultLanguage || language || '', path || defaultPath || '')
        if (model !== editor.getModel()) {
            if (saveViewState) viewStates.set(previousPath, editor.saveViewState())
            editor.setModel(model)
            if (saveViewState) editor.restoreViewState(viewStates.get(path) ?? null)
        }
    }, [path], isEditorReady)

    useUpdate(() => { editorRef.current?.updateOptions(options) }, [options], isEditorReady)

    useUpdate(() => {
        const editor = editorRef.current
        if (!editor || value === undefined) return
        if (editor.getOption(monaco.editor.EditorOption.readOnly)) editor.setValue(value)
        else if (value !== editor.getValue()) {
            // 整篇换成新值,作为一步可撤销的编辑(不是 setValue:那会清掉撤销栈)
            preventTriggerChangeEvent.current = true
            editor.executeEdits('', [{ range: editor.getModel()!.getFullModelRange(), text: value, forceMoveMarkers: true }])
            editor.pushUndoStop()
            preventTriggerChangeEvent.current = false
        }
    }, [value], isEditorReady)

    useUpdate(() => {
        const model = editorRef.current?.getModel()
        if (model && language) monaco.editor.setModelLanguage(model, language)
    }, [language], isEditorReady)

    useUpdate(() => { if (line !== undefined) editorRef.current?.revealLine(line) }, [line], isEditorReady)

    useUpdate(() => { monaco.editor.setTheme(theme) }, [theme], isEditorReady)

    useEffect(() => {
        if (isEditorReady) onMountRef.current(editorRef.current!, monaco)
    }, [isEditorReady])

    useEffect(() => {
        if (!isEditorReady || !onChange) return
        subscriptionRef.current?.dispose()
        subscriptionRef.current = editorRef.current?.onDidChangeModelContent(event => {
            if (!preventTriggerChangeEvent.current) onChange(editorRef.current!.getValue(), event)
        })
    }, [isEditorReady, onChange])

    useEffect(() => {
        if (!isEditorReady) return
        const listener = monaco.editor.onDidChangeMarkers(uris => {
            const editorUri = editorRef.current?.getModel()?.uri
            if (editorUri && uris.find(uri => uri.path === editorUri.path))
                onValidate?.(monaco.editor.getModelMarkers({ resource: editorUri }))
        })
        return () => listener.dispose()
    }, [isEditorReady, onValidate])

    return (
        <MonacoContainer width={width} height={height} isEditorReady={isEditorReady} loading={loading}
            _ref={containerRef} className={className} wrapperProps={wrapperProps} />
    )
}

export default memo(Editor)
