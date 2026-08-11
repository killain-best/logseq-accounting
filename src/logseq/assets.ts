import { sdk } from './sdk'
import { ASSET_PROP, ASSET_TAG } from './schema'
import { appendAfterJournalTimestamp } from './presentation'

export type AssetSide = 'asset' | 'liability'

export interface AssetItem {
  id: string
  name: string
  amount: number
}

export interface AssetGroup {
  id: string
  side: AssetSide
  name: string
  items: AssetItem[]
}

export interface AssetSnapshot {
  version: 1
  recordedAt: number
  groups: AssetGroup[]
}

const id = (): string => crypto.randomUUID()

export function defaultAssetSnapshot(language: 'zh-CN' | 'en' = 'zh-CN'): AssetSnapshot {
  const group = (side: AssetSide, name: string, items: string[]): AssetGroup => ({
    id: id(), side, name, items: items.map((itemName) => ({ id: id(), name: itemName, amount: 0 })),
  })
  const groups = language === 'en'
    ? [
        group('asset', 'Liquid funds', ['WeChat Pay', 'Alipay', 'CCB Debit 1234', 'CMB Debit 5678']),
        group('asset', 'Fixed assets', ['Property', 'Car']),
        group('asset', 'Investments', ['Brokerage account', 'Alipay funds']),
        group('asset', 'Receivables', []),
        group('liability', 'Debts', ['Mortgage', 'Huabei']),
      ]
    : [
        group('asset', '流动资金', ['微信', '支付宝', '建行储蓄卡1234', '招行储蓄卡5678']),
        group('asset', '固定资产', ['房产', '汽车']),
        group('asset', '投资理财', ['股票账户', '支付宝基金']),
        group('asset', '应收款', []),
        group('liability', '负债', ['房贷', '花呗']),
      ]
  return {
    version: 1,
    recordedAt: Date.now(),
    groups,
  }
}

export function assetTotals(snapshot: AssetSnapshot): { assets: number; liabilities: number; net: number } {
  let assets = 0
  let liabilities = 0
  for (const group of snapshot.groups) {
    const total = group.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    if (group.side === 'asset') assets += total
    else liabilities += total
  }
  return { assets, liabilities, net: assets - liabilities }
}

function identOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const raw = record.ident ?? record['db/ident'] ?? record[':db/ident']
  if (typeof raw !== 'string') return null
  const ident = raw.startsWith(':') ? raw : `:${raw}`
  return /^:[\w.*+!?$%&=<>/-]+$/u.test(ident) ? ident : null
}

function refId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const raw = record.id ?? record['db/id'] ?? record[':db/id']
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function parseSnapshotValues(values: unknown[]): AssetSnapshot[] {
  const snapshots: AssetSnapshot[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    try {
      const parsed = JSON.parse(value) as AssetSnapshot
      if (parsed?.version === 1 && Array.isArray(parsed.groups)) snapshots.push(parsed)
    } catch {
      console.warn('[logseq-accounting] ignored invalid asset snapshot')
    }
  }
  return snapshots
}

export async function queryAssetSnapshots(): Promise<AssetSnapshot[]> {
  const property = await sdk.Editor.getProperty(ASSET_PROP.snapshot)
  let ident = identOf(property)
  if (!ident) {
    const rows = await sdk.DB.datascriptQuery<unknown[]>(
      `[:find (pull ?property [:db/ident :block/name :block/title])
        :where [?property :db/ident ?ident]]`,
    ).catch(() => [])
    for (const row of rows) {
      const entity = Array.isArray(row) ? row[0] : null
      if (!entity || typeof entity !== 'object') continue
      const record = entity as Record<string, unknown>
      const name = record['block/name'] ?? record[':block/name'] ?? record['block/title'] ?? record[':block/title']
      if (name === ASSET_PROP.snapshot || String(record['db/ident'] ?? record[':db/ident'] ?? '').endsWith(`/${ASSET_PROP.snapshot}`)) {
        ident = identOf(entity)
        if (ident) break
      }
    }
  }
  if (!ident) return []
  const rows: unknown[] = await sdk.DB.datascriptQuery(
    `[:find ?raw
      :where
      [?block ${ident} ?raw]]`,
  )
  const rawValues = (rows ?? []).map((row) => Array.isArray(row) ? row[0] : null)
  const refIds = rawValues.map(refId).filter((id): id is number => id != null)
  let referencedValues: unknown[] = []
  if (refIds.length) {
    const valueRows: unknown[] = await sdk.DB.datascriptQuery(
      `[:find ?value
        :in $ [?ref ...]
        :where
        (or [?ref :logseq.property/value ?value]
            [?ref :block/title ?value])]`,
      `[${refIds.join(' ')}]`,
    )
    referencedValues = (valueRows ?? []).map((row) => Array.isArray(row) ? row[0] : null)
  }
  return parseSnapshotValues([...rawValues, ...referencedValues]).sort((a, b) => b.recordedAt - a.recordedAt)
}

export function reviveItem(snapshots: AssetSnapshot[], side: AssetSide, groupName: string, itemName: string): AssetItem | null {
  for (const snapshot of snapshots) {
    const group = snapshot.groups.find((entry) => entry.side === side && entry.name.trim() === groupName.trim())
    const item = group?.items.find((entry) => entry.name.trim() === itemName.trim())
    if (item) return { ...item }
  }
  return null
}

export async function saveAssetSnapshot(
  sourceUuid: string,
  snapshot: AssetSnapshot,
  display: { currency: string; decimalPlaces: number; language: 'zh-CN' | 'en' } = { currency: '¥', decimalPlaces: 2, language: 'zh-CN' },
): Promise<string> {
  const totals = assetTotals(snapshot)
  const normalized: AssetSnapshot = {
    ...snapshot,
    groups: snapshot.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
    })),
  }
  const net = totals.net.toLocaleString(display.language === 'en' ? 'en' : 'zh-CN', { minimumFractionDigits: display.decimalPlaces, maximumFractionDigits: display.decimalPlaces })
  const title = `📊 ${display.language === 'en' ? 'Asset snapshot · Net worth' : '资产盘点 · 净资产'} ${display.currency}${net}`
  const source = await sdk.Editor.getBlock(sourceUuid)
  if (!source) throw new Error('无法读取当前日志块，请重新输入 /assets')
  const content = String(source?.content ?? source?.title ?? '').trim()
  const timestampedTitle = appendAfterJournalTimestamp(content, title)
  let uuid = sourceUuid
  if (content && !timestampedTitle) {
    const inserted = await sdk.Editor.insertBlock(sourceUuid, title, { sibling: true })
    if (!inserted?.uuid) throw new Error('无法创建资产盘点块')
    uuid = inserted.uuid
  } else {
    await sdk.Editor.updateBlock(uuid, timestampedTitle ?? title)
  }
  let tag = await sdk.Editor.getTag(ASSET_TAG)
  if (!tag) tag = await sdk.Editor.createTag(ASSET_TAG)
  if (tag?.uuid) await sdk.Editor.addBlockTag(uuid, tag.uuid)
  // 完整快照是唯一数据源；汇总字段仅用于 Logseq 内浏览，超大数值不应让整次保存失败。
  await sdk.Editor.upsertBlockProperty(uuid, ASSET_PROP.snapshot, JSON.stringify(normalized))
  await Promise.allSettled([
    sdk.Editor.upsertBlockProperty(uuid, ASSET_PROP.total, totals.assets),
    sdk.Editor.upsertBlockProperty(uuid, ASSET_PROP.liability, totals.liabilities),
  ])
  return uuid
}
