import { sdk } from './sdk'

export interface AccountingSettings {
  language: 'zh-CN' | 'en'
  currency: string
  decimalPlaces: number
  expenseColor: string
  incomeColor: string
  assetColor: string
  guideExpense: string
  guideIncome: string
  guideAssets: string
  guideReport: string
  expenseCategories: string[]
  incomeCategories: string[]
}

const DEFAULTS = {
  language: 'zh-CN',
  currency: '¥',
  decimalPlaces: '2',
  expenseColor: '#dc2626',
  incomeColor: '#15803d',
  assetColor: '#d69e00',
  guideExpense: '记录支出 / Record an expense',
  guideIncome: '记录收入 / Record income',
  guideAssets: '资产盘点 / Review assets and liabilities',
  guideReport: '记账报表 / Open the accounting report',
  expenseCategories: '餐饮,交通,购物,居住,娱乐,医疗,教育,其他',
  incomeCategories: '工资,奖金,理财,兼职,其他',
}

export const splitList = (s: unknown): string[] =>
  String(s ?? '')
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean)

export function setupSettings(): void {
  sdk.useSettingsSchema([
    { key: 'guideExpense', type: 'string', title: '使用引导 1 · /expense', description: '命令说明，可自定义；插件启动时不会弹窗', default: DEFAULTS.guideExpense },
    { key: 'guideIncome', type: 'string', title: '使用引导 2 · /income', description: '命令说明，可自定义', default: DEFAULTS.guideIncome },
    { key: 'guideAssets', type: 'string', title: '使用引导 3 · /assets', description: '命令说明，可自定义', default: DEFAULTS.guideAssets },
    { key: 'guideReport', type: 'string', title: '使用引导 4 · /report', description: '命令说明，可自定义', default: DEFAULTS.guideReport },
    { key: 'language', type: 'enum', title: '界面语言 / Language', description: '插件界面使用的语言', default: DEFAULTS.language, enumChoices: ['zh-CN', 'en'], enumPicker: 'select' },
    { key: 'currency', type: 'string', title: '币种符号', description: '金额前显示的符号', default: DEFAULTS.currency },
    { key: 'decimalPlaces', type: 'enum', title: '小数位数 / Decimal places', description: '金额显示保留的小数位数', default: DEFAULTS.decimalPlaces, enumChoices: ['0', '1', '2', '3', '4'], enumPicker: 'select' },
    { key: 'expenseColor', type: 'string', title: '支出颜色 / Expense color', description: 'CSS 颜色，例如 #dc2626', default: DEFAULTS.expenseColor },
    { key: 'incomeColor', type: 'string', title: '收入颜色 / Income color', description: 'CSS 颜色，例如 #15803d', default: DEFAULTS.incomeColor },
    { key: 'assetColor', type: 'string', title: '资产盘点颜色 / Snapshot color', description: '财务日历中资产盘点星标的颜色', default: DEFAULTS.assetColor },
    { key: 'expenseCategories', type: 'string', title: '支出分类', description: '逗号分隔，可自定义', default: DEFAULTS.expenseCategories },
    { key: 'incomeCategories', type: 'string', title: '收入分类', description: '逗号分隔，可自定义', default: DEFAULTS.incomeCategories },
  ])
}

export function parseSettings(rawSettings: Record<string, unknown> = {}): AccountingSettings {
  const s = rawSettings
  return {
    language: s.language === 'en' ? 'en' : 'zh-CN',
    currency: typeof s.currency === 'string' && s.currency ? s.currency : DEFAULTS.currency,
    decimalPlaces: Math.max(0, Math.min(4, Number(s.decimalPlaces ?? DEFAULTS.decimalPlaces) || 0)),
    expenseColor: typeof s.expenseColor === 'string' && s.expenseColor ? s.expenseColor : DEFAULTS.expenseColor,
    incomeColor: typeof s.incomeColor === 'string' && s.incomeColor ? s.incomeColor : DEFAULTS.incomeColor,
    assetColor: typeof s.assetColor === 'string' && s.assetColor ? s.assetColor : DEFAULTS.assetColor,
    guideExpense: typeof s.guideExpense === 'string' && s.guideExpense.trim() ? s.guideExpense : DEFAULTS.guideExpense,
    guideIncome: typeof s.guideIncome === 'string' && s.guideIncome.trim() ? s.guideIncome : DEFAULTS.guideIncome,
    guideAssets: typeof s.guideAssets === 'string' && s.guideAssets.trim() ? s.guideAssets : DEFAULTS.guideAssets,
    guideReport: typeof s.guideReport === 'string' && s.guideReport.trim() ? s.guideReport : DEFAULTS.guideReport,
    expenseCategories: splitList(s.expenseCategories ?? DEFAULTS.expenseCategories),
    incomeCategories: splitList(s.incomeCategories ?? DEFAULTS.incomeCategories),
  }
}

export function getSettings(): AccountingSettings {
  return parseSettings(sdk.settings)
}
