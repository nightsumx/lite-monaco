// Monaco OpenerService 的接入:行为在 src/core/feature/openerservice.ts;这里只把 Monaco 的 URI 实现注入为解析器(lite 不绑定 uri 类)。
import { URI } from '../../../../../../reference/_vscode-src/src/vs/base/common/uri'
import { OpenerService as Core } from '../../../../src/core/feature/openerservice'

export class OpenerService extends Core {
    constructor(editorService: any, commandService: any) { super(editorService, commandService, v => URI.parse(v) as any) }
}
