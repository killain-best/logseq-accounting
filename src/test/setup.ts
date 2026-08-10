// @logseq/libs 在加载 UMD 入口时会读取 self/window，单测中用 globalThis 代替。
Object.assign(globalThis, { self: globalThis, window: globalThis })
