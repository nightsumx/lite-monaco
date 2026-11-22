// 主题变量的传递:liteMonaco() 把每个实例的颜色写成 `--lm-*` inline 变量挂在 .cm-editor 上。
// 挂到 body 的浮层(补全/右键菜单/命令面板/只读提示…)不在 .cm-editor 子树里继承不到,
// 打开时调一次 inheritThemeVars(view, root) 抄一份 —— 同页一暗一亮两个实例,各自的浮层跟各自走。

interface HasDom { dom: HTMLElement }

/** 把 view.dom 上的 `--lm-*` inline 变量抄到 el(浮层根元素)上。view 没有变量时什么都不做。 */
export function inheritThemeVars(view: HasDom, el: HTMLElement): void {
    const src = view.dom.style
    for (let i = 0; i < src.length; i++) {
        const name = src.item(i)
        if (name.startsWith('--lm-')) el.style.setProperty(name, src.getPropertyValue(name))
    }
}
