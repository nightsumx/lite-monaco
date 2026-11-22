// Monaco 的测试用 Workspace:id + folders + configuration 的数据袋。
export class Workspace {
    constructor(readonly id: string, readonly folders: any[] = [], readonly configuration: any = null) { }
}
