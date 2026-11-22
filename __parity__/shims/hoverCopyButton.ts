// Monaco 的 HoverCopyButton → core 的 attachHoverCopyButton(DOM 行为在 src/core/feature/hover.ts)。
// 垫片只把 (container, getContent, clipboardService, hoverService) 的 DI 形状翻译成注入选项。
import { attachHoverCopyButton } from '../../src/core/feature/hover'

export class HoverCopyButton {
    private readonly h: { dispose(): void }
    constructor(container: HTMLElement, getContent: () => string, clipboardService: { writeText(t: string): Promise<void> | void }, _hoverService: unknown) {
        this.h = attachHoverCopyButton(container, getContent, { write: t => clipboardService.writeText(t) })
    }
    dispose(): void { this.h.dispose() }
}
