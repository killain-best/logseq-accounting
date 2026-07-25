import { sdk } from './sdk'

export interface AccountingSettings {
  currency: string
  expenseCategories: string[]
  incomeCategories: string[]
  accounts: string[]
  budgets: Record<string, number>
}

const DEFAULTS = {
  currency: '¥',
  expenseCategories: '餐饮,交通,购物,居住,娱乐,医疗,教育,其他',
  incomeCategories: '工资,奖金,理财,兼职,其他',
  accounts: '现金,微信,支付宝,银行卡',
}

const splitList = (s: unknown): string[] =>
  String(s ?? '')
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean)

export function setupSettings(): void {
  sdk.useSettingsSchema([
    { key: 'currency', type: 'string', title: '币种符号', description: '金额前显示的符号', default: DEFAULTS.currency },
    { key: 'expenseCategories', type: 'string', title: '支出分类', description: '逗号分隔，可自定义', default: DEFAULTS.expenseCategories },
    { key: 'incomeCategories', type: 'string', title: '收入分类', description: '逗号分隔，可自定义', default: DEFAULTS.incomeCategories },
    { key: 'accounts', type: 'string', title: '账户', description: '逗号分隔，可自定义', default: DEFAULTS.accounts },
    { key: 'budgets', type: 'string', title: '分类月预算', description: 'JSON 格式，如 {"餐饮":2000}；建议直接在仪表盘「预算」页编辑', default: '{}' },
  ])
}

export function getSettings(): AccountingSettings {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = sdk.settings ?? {}
  let budgets: Record<string, number> = {}
  try {
    const raw = typeof s.budgets === 'string' ? JSON.parse(s.budgets || '{}') : s.budgets
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        const n = Number(v)
        if (Number.isFinite(n) && n > 0) budgets[k] = n
      }
    }
  } catch {
    // 忽略格式错误的预算配置
  }
  return {
    currency: typeof s.currency === 'string' && s.currency ? s.currency : DEFAULTS.currency,
    expenseCategories: splitList(s.expenseCategories ?? DEFAULTS.expenseCategories),
    incomeCategories: splitList(s.incomeCategories ?? DEFAULTS.incomeCategories),
    accounts: splitList(s.accounts ?? DEFAULTS.accounts),
    budgets,
  }
}
