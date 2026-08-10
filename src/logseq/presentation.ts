import { TYPE_INCOME, type TYPE_EXPENSE } from './schema'

/** 旧版曾使用此不可见字符，Logseq 会截断其后的渲染内容，仅用于迁移识别。 */
const LEGACY_INLINE_AMOUNT_MARKER = '\u2063'
const INLINE_AMOUNT_SUFFIX = /\s+·\s+[+−][^\d\s]*\d[\d,.]*$/u
const INLINE_SUMMARY_SUFFIX = /　[+−][^\s·]+(?:\s+·\s+[^·]+){0,2}$/u

export function stripInlineSummary(title: string): string {
  const legacyAt = title.indexOf(LEGACY_INLINE_AMOUNT_MARKER)
  const withoutLegacy = legacyAt >= 0 ? title.slice(0, legacyAt) : title
  return withoutLegacy.replace(INLINE_SUMMARY_SUFFIX, '').replace(INLINE_AMOUNT_SUFFIX, '').trimEnd()
}

export function formatInlineTxnTitle(
  title: string,
  amount: number,
  type: typeof TYPE_INCOME | typeof TYPE_EXPENSE,
  currency: string,
  category = '',
  account = '',
  decimalPlaces?: number,
): string {
  const sign = type === TYPE_INCOME ? '+' : '−'
  const value = amount.toLocaleString('zh-CN', decimalPlaces == null
    ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
    : { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })
  const details = [`${sign}${currency}${value}`, category.trim(), account.trim()].filter(Boolean)
  return `${stripInlineSummary(title)}　${details.join(' · ')}`
}
