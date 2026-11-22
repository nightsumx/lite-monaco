// platform/instantiation/common/descriptors.SyncDescriptor:服务集合里「延迟实例化」的标记(原版是纯数据类)。
export class SyncDescriptor<T = unknown> {
    constructor(readonly ctor: new (...args: any[]) => T, readonly staticArguments: unknown[] = [], readonly supportsDelayedInstantiation = false) { }
}
