import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMock = vi.hoisted(() => ({
  Editor: { getProperty: vi.fn() },
  DB: { datascriptQuery: vi.fn() },
}))

vi.mock('./sdk', () => ({ sdk: sdkMock }))

import { invalidateQueryCache, monthlySeries, normalizeTxnType, periodRange, periodSeries, queryAllTxns, shiftMonth, shiftPeriod, summarize, summarizePeriod, type Txn } from './query'
import { TYPE_EXPENSE, TYPE_INCOME } from './schema'

const txn = (overrides: Partial<Txn>): Txn => ({
  uuid: crypto.randomUUID(),
  title: '',
  rawTitle: '',
  amount: 1,
  type: TYPE_EXPENSE,
  category: '',
  account: '',
  journalDay: 20260810,
  pageName: 'Aug 10th, 2026',
  ...overrides,
})

describe('transaction aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateQueryCache()
  })

  it('shifts months across year boundaries', () => {
    expect(shiftMonth(202601, -1)).toBe(202512)
    expect(shiftMonth(202512, 2)).toBe(202602)
    expect(shiftMonth(202603, -15)).toBe(202412)
  })

  it('summarizes one month and sorts newest day first', () => {
    const result = summarize([
      txn({ uuid: 'expense', amount: 35, category: '餐饮', journalDay: 20260809 }),
      txn({ uuid: 'income', amount: 100, type: TYPE_INCOME, journalDay: 20260810 }),
      txn({ uuid: 'other-month', amount: 9, journalDay: 20260731 }),
    ], 202608)

    expect(result.expense).toBe(35)
    expect(result.income).toBe(100)
    expect(result.byCategory['餐饮']).toBe(35)
    expect(result.txns.map((item) => item.uuid)).toEqual(['income', 'expense'])
  })

  it('uses a safe category dictionary for user-provided names', () => {
    const result = summarize([txn({ category: '__proto__', amount: 8 })], 202608)
    expect(Object.getPrototypeOf(result.byCategory)).toBeNull()
    expect(result.byCategory.__proto__).toBe(8)
  })

  it('builds a chronological six-month series ending at the selected month', () => {
    const result = monthlySeries([
      txn({ amount: 10, journalDay: 20260301 }),
      txn({ amount: 20, type: TYPE_INCOME, journalDay: 20260801 }),
    ], 202608, 6)

    expect(result.map((point) => point.month)).toEqual([202603, 202604, 202605, 202606, 202607, 202608])
    expect(result[0].expense).toBe(10)
    expect(result[5].income).toBe(20)
  })

  it('uses Monday through Sunday for weekly reports', () => {
    expect(periodRange('week', 20260812)).toMatchObject({ start: 20260810, end: 20260816 })
    expect(shiftPeriod('week', 20260812, -1)).toBe(20260805)
    const rows = [txn({ amount: 10, journalDay: 20260810 }), txn({ amount: 20, journalDay: 20260817 })]
    expect(summarizePeriod(rows, 'week', 20260812).expense).toBe(10)
    expect(periodSeries(rows, 'week', 20260812, 2)).toHaveLength(2)
  })

  it('moves month periods without skipping February from a month end', () => {
    expect(shiftPeriod('month', 20260131, 1)).toBe(20260201)
  })

  it('recognizes income across DB return shapes and falls back to the original emoji', () => {
    expect(normalizeTxnType(TYPE_INCOME)).toBe(TYPE_INCOME)
    expect(normalizeTxnType([TYPE_INCOME])).toBe(TYPE_INCOME)
    expect(normalizeTxnType({ title: TYPE_INCOME })).toBe(TYPE_INCOME)
    expect(normalizeTxnType(undefined, '💰 奖金')).toBe(TYPE_INCOME)
    expect(normalizeTxnType(undefined, '💸 午餐')).toBe(TYPE_EXPENSE)
  })

  it('queries DB graph properties by their namespaced idents', async () => {
    const propIdents: Record<string, string> = {
      txn_amount: ':plugin.property.test/txn_amount',
      txn_type: ':plugin.property.test/txn_type',
      txn_category: ':plugin.property.test/txn_category',
      txn_account: ':plugin.property.test/txn_account',
    }
    sdkMock.Editor.getProperty.mockImplementation(async (key: string) => ({ ident: propIdents[key] }))
    sdkMock.DB.datascriptQuery.mockImplementation(async (query: string, blockIds?: string) => {
      if (query.includes(':find ?b ?uuid')) {
        expect(query).toContain('[?b :plugin.property.test/txn_amount ?amount]')
        return [[101, 'income-uuid', '💰 工资', 301, 20260801, '2026-08-01', '2026-08-01']]
      }
      if (query.includes(':find ?uuid ?v')) {
        expect(blockIds).toBe('[101]')
        if (query.includes('/txn_type')) return [['income-uuid', 302]]
        if (query.includes('/txn_category')) return [['income-uuid', 201]]
        if (query.includes('/txn_account')) return [['income-uuid', 202]]
      }
      if (query.includes(':find ?id ?name')) return [[201, '工资'], [202, '银行卡'], [302, TYPE_INCOME]]
      if (query.includes(':find ?id ?value')) return [[301, 100]]
      return []
    })

    await expect(queryAllTxns()).resolves.toEqual([
      expect.objectContaining({
        uuid: 'income-uuid',
        type: TYPE_INCOME,
        category: '工资',
        account: '银行卡',
      }),
    ])
  })
})
