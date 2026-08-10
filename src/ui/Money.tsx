import { getSettings } from '../logseq/settings'

export function moneyParts(amount: number, decimalPlaces = 2): { integer: string; decimal: string } {
  const formatted = Math.abs(Number(amount) || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
  const [integer, decimal = ''] = formatted.split('.')
  return { integer, decimal }
}

export function Money({ amount }: { amount: number }) {
  const { decimalPlaces } = getSettings()
  const { integer, decimal } = moneyParts(amount, decimalPlaces)
  return <>{amount < 0 ? '−' : ''}{integer}{decimal && <span className="money-decimal">.{decimal}</span>}</>
}
