import { sdk } from './sdk'

/** 账单 tag（类）名 */
export const TXN_TAG = '账单'

/** 属性 key：稳定、snake_case、带前缀防冲突 */
export const PROP = {
  amount: 'txn_amount',
  type: 'txn_type',
  category: 'txn_category',
  account: 'txn_account',
} as const

export const TYPE_EXPENSE = '支出'
export const TYPE_INCOME = '收入'

type PropertySchemaDef = {
  type: string
  cardinality: 'one' | 'many'
  hide: boolean
  public: boolean
}

/** [key, schema, 显示名] */
const PROP_DEFS: Array<[string, PropertySchemaDef, string]> = [
  [PROP.amount, { type: 'number', cardinality: 'one', hide: false, public: true }, '金额'],
  [PROP.type, { type: 'default', cardinality: 'one', hide: false, public: true }, '类型'],
  [PROP.category, { type: 'node', cardinality: 'one', hide: false, public: true }, '分类'],
  [PROP.account, { type: 'node', cardinality: 'one', hide: false, public: true }, '账户'],
]

/**
 * 幂等确保 DB graph schema：#账单 tag + txn_* 属性。
 * 返回 false 表示当前不是 DB graph（插件应停用）。
 */
export async function ensureSchema(): Promise<boolean> {
  const isDb = await sdk.App.checkCurrentIsDbGraph?.()
  if (!isDb) {
    await sdk.UI.showMsg('「日志记账」需要 DB 版 graph，当前 graph 不支持，插件已停用。', 'warning')
    return false
  }
  for (const [key, schema, name] of PROP_DEFS) {
    await sdk.Editor.upsertProperty(key, schema, { name })
  }
  await sdk.Editor.createTag(TXN_TAG, {
    tagProperties: PROP_DEFS.map(([key, schema]) => ({ name: key, schema })),
  })
  return true
}
