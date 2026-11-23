'use client'
// <DiffEditor>:对位 @monaco-editor/react 4.7.0 的 DiffEditor。和 <Editor> 一样,不经过 loader、
// StrictMode 下只建一次且留下的是活的、卸载时按最新的 keepCurrentOriginalModel / keepCurrentModifiedModel 处理。
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { MonacoContainer, getOrCreateModel, monaco, noop, useEditorLifetime, useLatest, useUpdate, type Monaco, type Theme } from './shared'

export type MonacoDiffEditor = monaco.editor.IStandaloneDiffEditor
export type DiffOnMount = (editor: MonacoDiffEditor, monaco: Monaco) => void
export type DiffBeforeMount = (monaco: Monaco) => void

export type DiffEditorProps = {
    /** 左边(原文)的内容 */
    original?: string
    /** 右边(改后)的内容 */
    modified?: string
    /** 两边共用的语言 */
    language?: string
    /** 只给左边的语言,优先于 language */
    originalLanguage?: string
    /** 只给右边的语言,优先于 language */
    modifiedLanguage?: string
    /** 左边 model 的路径 */
    originalModelPath?: string
    /** 右边 model 的路径 */
    modifiedModelPath?: string
    /** 卸载时留着左边的 model。@default false */
    keepCurrentOriginalModel?: boolean
    /** 卸载时留着右边的 model。@default false */
    keepCurrentModifiedModel?: boolean
    /** @default "light" */
    theme?: Theme | string
    /** @default "Loading..." */
    loading?: ReactNode
    options?: monaco.editor.IDiffEditorConstructionOptions
    /** @default "100%" */
    width?: number | string
    /** @default "100%" */
    height?: number | string
    className?: string
    wrapperProps?: object
    beforeMount?: DiffBeforeMount
    onMount?: DiffOnMount
}

function DiffEditor({
    original, modified, language, originalLanguage, modifiedLanguage, originalModelPath, modifiedModelPath,
    keepCurrentOriginalModel = false, keepCurrentModifiedModel = false,
    theme = 'light', loading = 'Loading...', options = {},
    height = '100%', width = '100%', className, wrapperProps = {},
    beforeMount = noop, onMount = noop,
}: DiffEditorProps) {
    const [isEditorReady, setIsEditorReady] = useState(false)
    const editorRef = useRef<MonacoDiffEditor | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const onMountRef = useRef(onMount)
    const beforeMountRef = useRef(beforeMount)
    const latest = useLatest({ keepCurrentOriginalModel, keepCurrentModifiedModel })

    useEditorLifetime(() => {
        const container = containerRef.current
        if (!container) return
        const editor = monaco.editor.createDiffEditor(container, { automaticLayout: true, ...options })
        beforeMountRef.current(monaco)
        editor.setModel({
            original: getOrCreateModel(monaco, original || '', originalLanguage || language || 'text', originalModelPath || ''),
            modified: getOrCreateModel(monaco, modified || '', modifiedLanguage || language || 'text', modifiedModelPath || ''),
        })
        monaco.editor.setTheme(theme)
        editorRef.current = editor
        setIsEditorReady(true)
        return () => {
            const models = editor.getModel()
            if (!latest.current.keepCurrentOriginalModel) models?.original?.dispose()
            if (!latest.current.keepCurrentModifiedModel) models?.modified?.dispose()
            editor.dispose()
            editorRef.current = null
        }
    })

    useUpdate(() => {
        const side = editorRef.current?.getOriginalEditor()
        if (!side) return
        const model = getOrCreateModel(monaco, original || '', originalLanguage || language || 'text', originalModelPath || '')
        if (model !== side.getModel()) side.setModel(model)
    }, [originalModelPath], isEditorReady)

    useUpdate(() => {
        const side = editorRef.current?.getModifiedEditor()
        if (!side) return
        const model = getOrCreateModel(monaco, modified || '', modifiedLanguage || language || 'text', modifiedModelPath || '')
        if (model !== side.getModel()) side.setModel(model)
    }, [modifiedModelPath], isEditorReady)

    useUpdate(() => {
        const side = editorRef.current!.getModifiedEditor()
        if (side.getOption(monaco.editor.EditorOption.readOnly)) side.setValue(modified || '')
        else if (modified !== side.getValue()) {
            side.executeEdits('', [{ range: side.getModel()!.getFullModelRange(), text: modified || '', forceMoveMarkers: true }])
            side.pushUndoStop()
        }
    }, [modified], isEditorReady)

    useUpdate(() => { editorRef.current?.getModel()?.original.setValue(original || '') }, [original], isEditorReady)

    useUpdate(() => {
        const models = editorRef.current!.getModel()!
        monaco.editor.setModelLanguage(models.original, originalLanguage || language || 'text')
        monaco.editor.setModelLanguage(models.modified, modifiedLanguage || language || 'text')
    }, [language, originalLanguage, modifiedLanguage], isEditorReady)

    useUpdate(() => { monaco.editor.setTheme(theme) }, [theme], isEditorReady)

    useUpdate(() => { editorRef.current?.updateOptions(options) }, [options], isEditorReady)

    useEffect(() => {
        if (isEditorReady) onMountRef.current(editorRef.current!, monaco)
    }, [isEditorReady])

    return (
        <MonacoContainer width={width} height={height} isEditorReady={isEditorReady} loading={loading}
            _ref={containerRef} className={className} wrapperProps={wrapperProps} />
    )
}

export default memo(DiffEditor)
