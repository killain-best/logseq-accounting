import { fmtMoney } from '../logseq/query'
import { getSettings } from '../logseq/settings'
import { Money, moneyParts } from './Money'

const PALETTE = [
  '#f97316', '#0ea5e9', '#8b5cf6', '#ef4444', '#10b981',
  '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#84cc16',
  '#eab308', '#64748b',
]

export interface Slice {
  label: string
  value: number
}

/** 分类支出环形图（纯 SVG，零依赖） */
export function Donut({ data, currency }: { data: Slice[]; currency: string }) {
  const settings = getSettings()
  const english = settings.language === 'en'
  const total = data.reduce((s, d) => s + d.value, 0)
  const R = 54
  const CX = 70
  const CY = 70
  const SW = 20
  const C = 2 * Math.PI * R
  let acc = 0
  const totalParts = moneyParts(total, settings.decimalPlaces)

  return (
    <div className="donut-wrap">
      <svg width="150" height="150" viewBox="0 0 140 140">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={SW} />
        {total > 0 &&
          data.map((d, i) => {
            if (d.value <= 0) return null
            const frac = d.value / total
            const len = Math.max(frac * C - 1.2, 0.5)
            const offset = acc * C
            acc += frac
            return (
              <circle
                key={d.label}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={SW}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${CX} ${CY})`}
              />
            )
          })}
        <text x={CX} y={CY - 2} textAnchor="middle" className="donut-center-label">
          {english ? 'Expenses' : '支出'}
        </text>
        <text x={CX} y={CY + 18} textAnchor="middle" className="donut-center-value">
          {currency}
          {totalParts.integer}{totalParts.decimal && <tspan className="money-decimal-svg">.{totalParts.decimal}</tspan>}
        </text>
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="legend-label">{d.label}</span>
            <span className="legend-value">
              {currency}
              <Money amount={d.value} />
            </span>
            <span className="legend-pct">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface BarPoint {
  label: string
  expense: number
  income: number
}

/** 近 N 个月收支柱状图（纯 SVG） */
export function MonthlyBars({ data, currency }: { data: BarPoint[]; currency: string }) {
  const settings = getSettings()
  const english = settings.language === 'en'
  const max = Math.max(1, ...data.flatMap((d) => [d.expense, d.income]))
  const W = 460
  const H = 180
  const padB = 26
  const padT = 14
  const innerH = H - padB - padT
  const groupW = W / data.length
  const barW = Math.min(20, (groupW - 18) / 2)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bars-svg" role="img" aria-label={english ? 'Income and expense chart for recent months' : '近几个月收支柱状图'}>
        <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke="var(--border)" strokeWidth={1} />
        {data.map((d, i) => {
          const x0 = i * groupW + groupW / 2
          const eh = (d.expense / max) * innerH
          const ih = (d.income / max) * innerH
          return (
            <g key={d.label}>
              <rect
                x={x0 - barW - 2}
                y={H - padB - eh}
                width={barW}
                height={Math.max(eh, d.expense > 0 ? 2 : 0)}
                rx={3}
                fill="var(--expense)"
                opacity={0.85}
              >
                <title>{`${english ? 'Expenses' : '支出'} ${currency}${fmtMoney(d.expense, settings.decimalPlaces)}`}</title>
              </rect>
              <rect
                x={x0 + 2}
                y={H - padB - ih}
                width={barW}
                height={Math.max(ih, d.income > 0 ? 2 : 0)}
                rx={3}
                fill="var(--income)"
                opacity={0.85}
              >
                <title>{`${english ? 'Income' : '收入'} ${currency}${fmtMoney(d.income, settings.decimalPlaces)}`}</title>
              </rect>
              <text x={x0} y={H - 8} textAnchor="middle" className="bar-label">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="bar-legend">
        <span>
          <i className="dot" style={{ background: 'var(--expense)' }} />
          {english ? 'Expenses' : '支出'}
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--income)' }} />
          {english ? 'Income' : '收入'}
        </span>
      </div>
    </div>
  )
}
