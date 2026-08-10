import '@logseq/libs'

export interface BlockLike {
  id?: number
  uuid?: string
  content?: string
  title?: string
  parent?: unknown
  ident?: string
  name?: string
}

interface TagLike {
  uuid?: string
}

type Unsubscribe = void | (() => void)
type MessageType = 'success' | 'warning' | 'error'

/**
 * 项目真正用到的 Logseq SDK 最小表面。DB 版宿主返回形态有差异，
 * 因此复杂数据保持 unknown，由 query/commands 在边界处做兼容解析。
 */
export interface AccountingSdk {
  settings?: Record<string, unknown>
  ready(fn: () => void | Promise<void>): Promise<void>
  showMainUI(options?: { autoFocus?: boolean }): void
  hideMainUI(options?: { restoreEditingCursor?: boolean }): void
  setMainUIInlineStyle(style: Record<string, string>): void
  provideModel(model: Record<string, (...args: never[]) => unknown>): void
  provideStyle(input: { key: string; style: string }): void
  useSettingsSchema(schema: Array<Record<string, unknown>>): void
  updateSettings(values: Record<string, unknown>): void | Promise<void>
  onSettingsChanged?(fn: () => void): Unsubscribe
  App: {
    checkCurrentIsDbGraph?: () => Promise<boolean>
    registerUIItem(area: string, item: { key: string; template: string }): void
    getUserConfigs?: () => Promise<Record<string, unknown>>
    onThemeModeChanged?: (fn: (event: { mode?: unknown }) => void) => Unsubscribe
    onMainUIChanged?: (fn: (event: { visible?: boolean }) => void) => Unsubscribe
    pushState(route: string, params: Record<string, unknown>): void | Promise<void>
  }
  Editor: {
    getBlock(block: string | number): Promise<BlockLike | null>
    updateBlock(block: string, content: string): Promise<unknown>
    insertBlock(block: string, content: string, options: { sibling: boolean }): Promise<BlockLike | null>
    moveBlock(block: string, target: string, options: { before: boolean }): Promise<unknown>
    getTag(name: string): Promise<TagLike | null>
    createTag(name: string, options?: Record<string, unknown>): Promise<TagLike | null>
    addBlockTag(block: string, tag: string): Promise<unknown>
    upsertBlockProperty(block: string, key: string, value: unknown): Promise<unknown>
    removeBlockProperty(block: string, key: string): Promise<unknown>
    upsertProperty(key: string, schema: Record<string, unknown>, options: { name: string }): Promise<unknown>
    getProperty(key: string): Promise<BlockLike | null>
    registerSlashCommand(name: string, fn: (event?: { uuid?: string }) => void | Promise<void>): void
    registerBlockContextMenuItem(name: string, fn: (event: { uuid: string }) => Promise<void>): unknown
    scrollToBlockInPage(page: string, block: string): Promise<unknown>
    createJournalPage(timestamp: number): Promise<BlockLike | null>
  }
  DB: {
    datascriptQuery<T = unknown>(query: string, ...inputs: unknown[]): Promise<T>
    onChanged?: (fn: (event: unknown) => void) => Unsubscribe
  }
  UI: {
    showMsg(message: string, type?: MessageType, options?: { timeout?: number }): void | Promise<void>
  }
}

// @logseq/libs 运行后会把 logseq 挂到全局；不可避免的断言只保留在这一处。
export const sdk = (globalThis as { logseq?: unknown }).logseq as AccountingSdk
