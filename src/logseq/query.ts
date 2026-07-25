import { sdk } from './sdk'
import { PROP, TYPE_EXPENSE, TYPE_INCOME } from './schema'

export interface Txn {
  uuid: string
  title: string
  amount: number
  type: string // '支出' | '收入'
  category: string
  account: string
  journalDay: number // YYYYMMDD
  pageName: string
}

/**
 * 关键背景（来自官方 idents 指南）：
 * 插件创建的属性，其 datascript 属性 ident 是
 *   :plugin.property.<plugin-id>/txn_amount
 * 而不是 :user.property/txn_amount。
 * 所以这里不硬编码 ident，而是：
 *   1. 先查出全部 property 实体，按名字/ident 后缀匹配，拿到它们的实体 id（数字）
 *   2. 用 :in 参数把实体 id 绑到数据模式的属性位置上查询（标量返回，无 keyword key 序列化风险）
 */

const PROP_DISPLAY: Record<string, string> = {
  txn_amount: '金额',
  txn_type: '类型',
  txn_category: '分类',
  txn_account: '账户',
}

/** SDK 返回结果的 key 形式不一，做兼容读取 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function g(obj: any, ...keys: string[]): any {
  if (obj == null || typeof obj !== 'object') return undefined
  for (const k of keys) {
    if (k in obj) return obj[k]
  }
  for (const k of keys) {
    const ck = ':' + k
    if (ck in obj) return obj[ck]
  }
  return undefined
}

/** node 型属性值可能是 {':db/id': n} / {id: n} / 数字 / 已解析的字符串 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refId(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const id = g(v, 'db/id', 'id')
  return typeof id === 'number' ? id : null
}

interface PropIds {
  amount: number
  type: number
  category: number
  account: number
}

let cachedIds: PropIds | null = null

/**
 * 找到插件 4 个属性实体的数字 id。
 * 首选官方 SDK 的 Editor.getProperty（最可靠）；
 * datascript ident 扫描仅作兜底——注意不能用 :block/type "property" 过滤，
 * 某些宿主版本不给属性实体标该类型（已实机踩坑）。
 */
async function resolvePropIds(): Promise<PropIds> {
  if (cachedIds) return cachedIds

  const keys = [PROP.amount, PROP.type, PROP.category, PROP.account] as const
  const found: Partial<Record<(typeof keys)[number], number>> = {}

  // 途径 1（首选）：SDK getProperty → BlockEntity.id
  await Promise.all(
    keys.map(async (key) => {
      try {
        const p = await sdk.Editor.getProperty(key)
        const id = Number(p?.id ?? g(p, 'db/id'))
        if (Number.isFinite(id)) found[key] = id
      } catch {
        // 忽略，走兜底
      }
    }),
  )

  // 途径 2（兜底）：datascript 按 ident 扫描
  if (keys.some((k) => found[k] == null)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await sdk.DB.datascriptQuery(
      `[:find (pull ?p [:db/id :db/ident :block/name :block/original-name :block/title])
        :where [?p :db/ident ?i]]`,
    ).catch(() => [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ents: any[] = (rows ?? []).map((r) => (Array.isArray(r) ? r[0] : r)).filter(Boolean)
    for (const key of keys) {
      if (found[key] != null) continue
      const display = PROP_DISPLAY[key]
      for (const e of ents) {
        const id = Number(g(e, 'db/id', 'id'))
        if (!Number.isFinite(id)) continue
        const cands = [
          g(e, 'db/ident', 'ident', 'block/ident'),
          g(e, 'block/name', 'name'),
          g(e, 'block/original-name', 'original-name', 'originalName'),
          g(e, 'block/title', 'title'),
        ].filter((x): x is string => typeof x === 'string')
        if (cands.some((c) => c === key || c.endsWith('/' + key) || c === display)) {
          found[key] = id
          break
        }
      }
    }
  }

  const missing = keys.filter((k) => found[k] == null)
  if (missing.length) {
    throw new Error(`无法定位插件属性实体：${missing.join(', ')}（请在插件页重载插件后重试）`)
  }
  cachedIds = {
    amount: found[PROP.amount]!,
    type: found[PROP.type]!,
    category: found[PROP.category]!,
    account: found[PROP.account]!,
  }
  console.info('[logseq-accounting] property entity ids:', cachedIds)
  return cachedIds
}

async function resolveRefNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (!ids.length) return map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await sdk.DB.datascriptQuery(
    `[:find ?id ?name
      :in $ [?id ...]
      :where (or [?id :block/original-name ?name]
                 [?id :block/title ?name])]`,
    `[${ids.join(' ')}]`,
  )
  for (const row of rows ?? []) {
    const [id, name] = Array.isArray(row) ? row : []
    if (typeof id === 'number' && typeof name === 'string' && !map.has(id)) {
      map.set(id, name)
    }
  }
  return map
}

/** 查「某属性 → 各块 uuid 的值」映射（可选属性用左连接方式在 JS 侧合并） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function queryPropMap(propId: number): Promise<Map<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await sdk.DB.datascriptQuery(
    `[:find ?uuid ?v
      :in $ ?pid
      :where
      [?b ?pid ?v]
      [?b :block/uuid ?uuid]]`,
    propId,
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = new Map<string, any>()
  for (const r of rows ?? []) {
    if (Array.isArray(r) && typeof r[0] === 'string') m.set(r[0], r[1])
  }
  return m
}

/** 查全部日志页上的账单块（以 txn_amount 属性为标记） */
export async function queryAllTxns(): Promise<Txn[]> {
  const ids = await resolvePropIds()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainRows: any[] = await sdk.DB.datascriptQuery(
    `[:find ?uuid ?title ?amount ?day ?poname ?pname
      :in $ ?aid
      :where
      [?b ?aid ?amount]
      [?b :block/uuid ?uuid]
      [(get-else $ ?b :block/title "") ?title]
      [?b :block/page ?p]
      [?p :block/journal-day ?day]
      [(get-else $ ?p :block/original-name "") ?poname]
      [(get-else $ ?p :block/name "") ?pname]]`,
    ids.amount,
  )

  const [typeMap, catMap, accMap] = await Promise.all([
    queryPropMap(ids.type),
    queryPropMap(ids.category),
    queryPropMap(ids.account),
  ])

  // node 型属性的引用 id → 页面名
  const refIds = new Set<number>()
  for (const v of catMap.values()) {
    const id = refId(v)
    if (id != null) refIds.add(id)
  }
  for (const v of accMap.values()) {
    const id = refId(v)
    if (id != null) refIds.add(id)
  }
  const names = await resolveRefNames([...refIds])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valueToName = (v: any): string => {
    if (typeof v === 'string') return v
    const id = refId(v)
    return id != null ? names.get(id) ?? '' : ''
  }

  const out: Txn[] = []
  for (const r of mainRows ?? []) {
    if (!Array.isArray(r)) continue
    const [uuid, title, amount, day, poname, pname] = r
    if (typeof uuid !== 'string' || !uuid) continue
    const journalDay = Number(day) || 0
    if (!journalDay) continue // 非日志页上的账不纳入统计
    const typeV = typeMap.get(uuid)
    out.push({
      uuid,
      title: String(title ?? ''),
      amount: Number(amount) || 0,
      type: typeof typeV === 'string' && typeV ? typeV : TYPE_EXPENSE,
      category: valueToName(catMap.get(uuid)),
      account: valueToName(accMap.get(uuid)),
      journalDay,
      pageName: String(poname || pname || ''),
    })
  }
  console.info(`[logseq-accounting] loaded ${out.length} txns`)
  return out
}

// ---------- 聚合与日期工具 ----------

export interface MonthSummary {
  month: number // YYYYMM
  expense: number
  income: number
  byCategory: Record<string, number> // 仅支出
  txns: Txn[]
}

export const monthOf = (day: number): number => Math.floor(day / 100)

export const currentMonth = (): number => {
  const d = new Date()
  return d.getFullYear() * 100 + (d.getMonth() + 1)
}

export function shiftMonth(month: number, delta: number): number {
  let y = Math.floor(month / 100)
  let m = (month % 100) - 1 + delta
  y += Math.floor(m / 12)
  m = ((m % 12) + 12) % 12
  return y * 100 + m + 1
}

export const monthLabel = (month: number): string =>
  `${Math.floor(month / 100)}年${month % 100}月`

export const dayLabel = (day: number): string =>
  `${Math.floor((day % 10000) / 100)}月${day % 100}日`

export function summarize(txns: Txn[], month: number): MonthSummary {
  const inMonth = txns.filter((t) => monthOf(t.journalDay) === month)
  const s: MonthSummary = { month, expense: 0, income: 0, byCategory: {}, txns: inMonth }
  for (const t of inMonth) {
    if (t.type === TYPE_INCOME) {
      s.income += t.amount
    } else {
      s.expense += t.amount
      const c = t.category || '未分类'
      s.byCategory[c] = (s.byCategory[c] ?? 0) + t.amount
    }
  }
  inMonth.sort((a, b) => b.journalDay - a.journalDay)
  return s
}

export interface MonthPoint {
  month: number
  label: string
  expense: number
  income: number
}

/** 以 endMonth 为终点的近 n 个月收支序列 */
export function monthlySeries(txns: Txn[], endMonth: number, n: number): MonthPoint[] {
  const months: number[] = []
  for (let i = n - 1; i >= 0; i--) months.push(shiftMonth(endMonth, -i))
  return months.map((m) => {
    const s = summarize(txns, m)
    return { month: m, label: `${m % 100}月`, expense: s.expense, income: s.income }
  })
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
