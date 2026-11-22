// Monaco 的 TestClipboardService:内存剪贴板夹具(测试替身,非被测行为)。
export class TestClipboardService {
    private text = ''
    async writeText(text: string): Promise<void> { this.text = text }
    async readText(): Promise<string> { return this.text }
    async readFindText(): Promise<string> { return '' }
    async writeFindText(): Promise<void> { /* */ }
}
