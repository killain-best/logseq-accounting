import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMock = vi.hoisted(() => ({
  Editor: {
    getProperty: vi.fn(), getBlock: vi.fn(), insertBlock: vi.fn(), updateBlock: vi.fn(),
    getTag: vi.fn(), createTag: vi.fn(), addBlockTag: vi.fn(), upsertBlockProperty: vi.fn(),
  },
  DB: { datascriptQuery: vi.fn() },
}))

vi.mock('./sdk', () => ({ sdk: sdkMock }))

import { assetTotals, defaultAssetSnapshot, queryAssetSnapshots, reviveItem, saveAssetSnapshot, type AssetSnapshot } from './assets'

describe('asset snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdkMock.Editor.getTag.mockResolvedValue({ uuid: 'asset-tag' })
    sdkMock.Editor.upsertBlockProperty.mockResolvedValue(undefined)
  })

  it('provides the agreed default groups and calculates net assets', () => {
    const snapshot = defaultAssetSnapshot()
    expect(snapshot.groups.find((group) => group.name === '流动资金')?.items.map((item) => item.name)).toContain('微信')
    snapshot.groups.find((group) => group.name === '流动资金')!.items[0].amount = 100
    snapshot.groups.find((group) => group.side === 'liability')!.items[0].amount = 30
    expect(assetTotals(snapshot)).toEqual({ assets: 100, liabilities: 30, net: 70 })
  })

  it('provides localized defaults for a new English workspace', () => {
    const snapshot = defaultAssetSnapshot('en')
    expect(snapshot.groups.find((group) => group.name === 'Liquid funds')?.items.map((item) => item.name)).toContain('Alipay')
    expect(snapshot.groups.find((group) => group.side === 'liability')?.name).toBe('Debts')
  })

  it('revives the last same-name child without changing historical snapshots', () => {
    const old = defaultAssetSnapshot()
    const item = old.groups[0].items[0]
    item.amount = 88
    const revived = reviveItem([old], 'asset', old.groups[0].name, item.name)
    expect(revived).toMatchObject({ id: item.id, amount: 88 })
    revived!.amount = 99
    expect(item.amount).toBe(88)
  })

  it('reads JSON snapshots from a DB property value reference', async () => {
    const snapshot: AssetSnapshot = { version: 1, recordedAt: 2, groups: [] }
    sdkMock.Editor.getProperty.mockResolvedValue({ ident: ':plugin.property.test/asset_snapshot' })
    sdkMock.DB.datascriptQuery
      .mockResolvedValueOnce([[321]])
      .mockResolvedValueOnce([[JSON.stringify(snapshot)]])
    await expect(queryAssetSnapshots()).resolves.toEqual([snapshot])
  })

  it('reads a snapshot stored directly as the DB property value', async () => {
    const snapshot: AssetSnapshot = { version: 1, recordedAt: 4, groups: [] }
    sdkMock.Editor.getProperty.mockResolvedValue({ ident: ':plugin.property.test/asset_snapshot' })
    sdkMock.DB.datascriptQuery.mockImplementation(async (query: string) =>
      query.includes(':logseq.property/value') ? [] : [[JSON.stringify(snapshot)]],
    )
    await expect(queryAssetSnapshots()).resolves.toEqual([snapshot])
  })

  it('falls back to scanning property idents on older SDK returns', async () => {
    const snapshot: AssetSnapshot = { version: 1, recordedAt: 3, groups: [] }
    sdkMock.Editor.getProperty.mockResolvedValue({ id: 99 })
    sdkMock.DB.datascriptQuery
      .mockResolvedValueOnce([[{ 'db/ident': 'plugin.property.test/asset_snapshot', 'block/name': 'asset_snapshot' }]])
      .mockResolvedValueOnce([[JSON.stringify(snapshot)]])
    await expect(queryAssetSnapshots()).resolves.toEqual([snapshot])
  })

  it('keeps a journal timestamp and writes the snapshot in the same block', async () => {
    sdkMock.Editor.getBlock.mockResolvedValue({ uuid: 'source', content: '11:31' })
    const snapshot: AssetSnapshot = { version: 1, recordedAt: 4, groups: [] }

    await saveAssetSnapshot('source', snapshot)

    expect(sdkMock.Editor.insertBlock).not.toHaveBeenCalled()
    expect(sdkMock.Editor.updateBlock).toHaveBeenCalledWith('source', '11:31 📊 资产盘点 · 净资产 ¥0.00')
  })
})
