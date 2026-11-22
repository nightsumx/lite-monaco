// Monaco PieceTreeTextBufferBuilder:测试用它把几块文本拼成 factory 喂给编辑器。lite-monaco 没有 piece tree(文档是 CM 的 Text),
// 这里只做"拼接 chunk → 文本",喂给 createModel;第二轮(factory 入口)因此和第一轮走同一个 lite-monaco 文档实现。
export class TextBufferFactory { constructor(readonly text: string) {} }
export class PieceTreeTextBufferBuilder {
    private readonly chunks: string[] = []
    acceptChunk(chunk: string): void { this.chunks.push(chunk) }
    finish(): TextBufferFactory { return new TextBufferFactory(this.chunks.join('')) }
}
