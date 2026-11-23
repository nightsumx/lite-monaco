// lite-monaco/react 的公共部分:类型、外层容器、几个小 hook、model 工具。
// 行为对位 @monaco-editor/react 4.7.0(MIT, Copyright (c) 2018 Suren Atoyan,见 THIRD-PARTY-NOTICES.md),
// 外层 DOM、默认值、props 生效的时机都和它一样,所以从它迁过来只改 import 路径。
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type DependencyList, type EffectCallback, type ReactNode, type RefObject } from 'react'
// 按包名引自己:发布后是用户装的那一份 lite-monaco(仓库里由 tsconfig paths / vitest alias 指回 src/index.ts)
import * as monaco from 'lite-monaco'

export type Monaco = typeof monaco
/** 内置主题名(和 @monaco-editor/react 一样只列这两个;别的名字照样能传,包括 defineTheme 定义的) */
export type Theme = 'vs-dark' | 'light'

export { monaco }

export const noop = (): void => { /* noop */ }

/**
 * 首次渲染不跑,之后 deps 变了、并且 applyChanges 为真才跑(@monaco-editor/react 的 useUpdate)。
 * 编辑器创建时已经用了当时的 props,所以首次不用再套一遍。
 */
export function useUpdate(effect: EffectCallback, deps: DependencyList, applyChanges = true): void {
    const isInitialMount = useRef(true)
    useEffect(isInitialMount.current || !applyChanges ? () => { isInitialMount.current = false } : effect, deps)
}

export function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined)
    useEffect(() => { ref.current = value }, [value])
    return ref.current
}

/**
 * 浏览器里用 layout effect:编辑器在第一次绘制前就建好,看不到「Loading...」那一帧。
 * 服务端渲染没有 layout,退回 useEffect(服务端两者都不跑,只是免得 React 18 报警告)。
 */
export const useCreateEffect: typeof useEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect

/**
 * 编辑器的一生:挂载时建一次,真卸载时才拆。StrictMode 和热更新会同步地「拆了又装」,拆的那一步排进微任务,
 * 紧接着的装把它取消,所以编辑器、model、beforeMount 都不重来(同 @monaco-editor/react 4.7 在 StrictMode 下只建一次,
 * 而且这里留下的编辑器是活的)。create 返回拆的函数;容器还没有时返回 undefined,下次装再试
 */
export function useEditorLifetime(create: () => (() => void) | undefined): void {
    const generation = useRef(0)
    const destroy = useRef<(() => void) | undefined>(undefined)
    useCreateEffect(() => {
        generation.current++
        destroy.current ??= create()
        return () => {
            const mine = ++generation.current
            queueMicrotask(() => {
                if (generation.current !== mine) return
                const d = destroy.current
                destroy.current = undefined
                d?.()
            })
        }
        // 只在挂载时建;之后的 props 变化由各个 useUpdate 交给编辑器
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
}

/** 当前值放进 ref:卸载、事件回调里读的是最新的 props,不是第一次渲染时的 */
export function useLatest<T>(value: T): RefObject<T> {
    const ref = useRef(value)
    ref.current = value
    return ref
}

export function getOrCreateModel(m: Monaco, value: string, language: string, path: string): monaco.editor.ITextModel {
    return m.editor.getModel(m.Uri.parse(path)) || m.editor.createModel(value, language, path ? m.Uri.parse(path) : undefined)
}

const wrapperStyle: CSSProperties = { display: 'flex', position: 'relative', textAlign: 'initial' }
const fullWidth: CSSProperties = { width: '100%' }
const hide: CSSProperties = { display: 'none' }
const loadingStyle: CSSProperties = { display: 'flex', height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center' }

export interface ContainerProps {
    width: number | string
    height: number | string
    isEditorReady: boolean
    loading: ReactNode
    _ref: RefObject<HTMLDivElement | null>
    className?: string
    wrapperProps: object
}

/**
 * 和 @monaco-editor/react 的 MonacoContainer 同一份 DOM:<section> 包一个编辑器 <div>,没建好时旁边放 loading。
 * 服务端渲染出来的是 loading,客户端第一次渲染一样,水合对得上;之后在 layout effect 里建好编辑器,绘制前就换掉。
 */
export function MonacoContainer({ width, height, isEditorReady, loading, _ref, className, wrapperProps }: ContainerProps) {
    return (
        <section style={{ ...wrapperStyle, width, height }} {...wrapperProps}>
            {!isEditorReady && <div style={loadingStyle}>{loading}</div>}
            <div ref={_ref} style={{ ...fullWidth, ...(!isEditorReady && hide) }} className={className} />
        </section>
    )
}
