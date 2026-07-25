import '@logseq/libs'

// @logseq/libs 运行后会把 logseq 挂到全局。
// 统一从这里取用：SDK 各版本的 TS 类型与运行时 API 存在差异，
// 故此处收敛为 any；我们自己的数据层（query/types）保持严格类型。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sdk: any = (globalThis as any).logseq
