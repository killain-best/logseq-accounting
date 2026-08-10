import { describe, expect, it } from 'vitest'
import { formatInlineTxnTitle, stripInlineSummary } from './presentation'
import { TYPE_EXPENSE, TYPE_INCOME } from './schema'

describe('inline transaction title', () => {
  it('formats expense and income without relying on color', () => {
    const expense = formatInlineTxnTitle('💸 午餐', 35.5, TYPE_EXPENSE, '¥', '餐饮', '微信')
    expect(expense).toBe('💸 午餐　−¥35.5 · 餐饮 · 微信')
    expect(expense).not.toMatch(/[()（）]/u)
    expect(expense).not.toContain('\u2063')
    expect(formatInlineTxnTitle('💰 工资', 12000, TYPE_INCOME, '¥')).toContain('+¥12,000')
  })

  it('replaces an existing generated amount instead of appending twice', () => {
    const first = formatInlineTxnTitle('💸 午餐', 35, TYPE_EXPENSE, '¥', '餐饮', '微信')
    const second = formatInlineTxnTitle(first, 42, TYPE_EXPENSE, '¥', '交通', '支付宝')
    expect(stripInlineSummary(second)).toBe('💸 午餐')
    expect(second).toContain('−¥42')
    expect(second).not.toContain('−¥35')
    expect(second).not.toContain('餐饮')
  })
})
