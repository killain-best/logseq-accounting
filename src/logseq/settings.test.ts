import { describe, expect, it } from 'vitest'
import { parseSettings, splitList } from './settings'

describe('settings parsing', () => {
  it('supports English and Chinese commas', () => {
    expect(splitList('餐饮, 交通，购物')).toEqual(['餐饮', '交通', '购物'])
  })

  it('falls back to category defaults', () => {
    const result = parseSettings({})
    expect(result.currency).toBe('¥')
    expect(result.expenseCategories).toContain('餐饮')
  })

  it('parses display customization and clamps decimal places', () => {
    const result = parseSettings({ language: 'en', decimalPlaces: '9', expenseColor: '#123456', guideExpense: 'My expense command' })
    expect(result).toMatchObject({ language: 'en', decimalPlaces: 4, expenseColor: '#123456', guideExpense: 'My expense command' })
  })
})
