// Monaco 同名同形的 Position / Range / Selection 值类型。实现住在 core/model/position(纯叶子模块,零依赖),
// 这样 core 的视图层(getPosition / getSelection / 事件载荷)也能返回真正的类实例,和 Monaco 一致;api 层照旧从这里取。
export * from '../core/model/position'
