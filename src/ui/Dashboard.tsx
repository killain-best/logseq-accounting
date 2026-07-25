import { useCallback, useEffect, useMemo, useState } from 'react'
import { sdk } from '../logseq/sdk'
import { closeUI } from './store'
import { getSettings, type AccountingSettings } from '../logseq/settings'
import {
  queryAllTxns,
  summarize,
  monthlySeries,
  currentMonth,
  shiftMonth,
  monthLabel,
  dayLabel,
  fmtMoney,
  type Txn,
  type MonthSummary,
} from '../logseq/query'
import { Donut, MonthlyBars } from './charts'
import { TYPE_INCOME } from '../logseq/schema'

type Tab = 'overview' | 'details' | 'budget'

export default function Dashboard() {
  const settings = getSettings()
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(currentMonth())
  const [tab, setTab] = useState<Tab>('overview')

  const reload = useCallback(async () => {
    try {
      setTxns(await queryAllTxns())
      setError('')
    } catch (e) {
      console.error('[logseq-accounting] query failed', e)
      setError(`数据查询失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初次加载 + 监听 graph 变化（开着面板记账实时刷新）
  useEffect(() => {
    reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = sdk.DB.onChanged?.(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(reload, 400)
    })
    return () => {
      if (timer) clearTimeout(timer)
      if (typeof off === 'function') off()
    }
  }, [reload])

  const summary = useMemo(() => summarize(txns, month), [txns, month])
  const series = useMemo(() => monthlySeries(txns, month, 6), [txns, month])
  const catData = useMemo(
    () =>
      Object.entries(summary.byCategory)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    [summary],
  )
  const byDay = useMemo(() => {
    const m = new Map<number, Txn[]>()
    for (const t of summary.txns) {
      const arr = m.get(t.journalDay) ?? []
      arr.push(t)
      m.set(t.journalDay, arr)
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0])
  }, [summary])

  async function jump(t: Txn) {
    closeUI()
    try {
      await sdk.Editor.scrollToBlockInPage(t.pageName, t.uuid)
    } catch (e) {
      console.warn('[logseq-accounting] jump failed', e)
    }
  }

  return (
    <div className="panel dash-panel" role="dialog" aria-label="记账报表">
      <div className="panel-header">
        <h2>📒 记账报表</h2>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">
            ‹
          </button>
          <span className="month-label">{monthLabel(month)}</span>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">
            ›
          </button>
        </div>
        <button className="icon-btn" onClick={closeUI} aria-label="关闭">
          ✕
        </button>
      </div>

      <div className="tabs">
        {(
          [
            ['overview', '概览'],
            ['details', '明细'],
            ['budget', '预算'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {loading ? (
          <div className="empty">加载中…</div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                <div className="cards">
                  <div className="card expense">
                    <div className="card-label">支出</div>
                    <div className="card-value">
                      {settings.currency}
                      {fmtMoney(summary.expense)}
                    </div>
                  </div>
                  <div className="card income">
                    <div className="card-label">收入</div>
                    <div className="card-value">
                      {settings.currency}
                      {fmtMoney(summary.income)}
                    </div>
                  </div>
                  <div className={`card net ${summary.income - summary.expense >= 0 ? 'pos' : 'neg'}`}>
                    <div className="card-label">结余</div>
                    <div className="card-value">
                      {settings.currency}
                      {fmtMoney(summary.income - summary.expense)}
                    </div>
                  </div>
                </div>
                {summary.txns.length === 0 ? (
                  <div className="empty">
                    本月还没有账单。
                    <br />
                    在日志页输入 <code>/记账-支出</code> 开始记一笔吧。
                  </div>
                ) : (
                  <div className="charts">
                    <section>
                      <h3>分类支出</h3>
                      {catData.length ? (
                        <Donut data={catData} currency={settings.currency} />
                      ) : (
                        <div className="empty">本月只有收入，没有支出 🎉</div>
                      )}
                    </section>
                    <section>
                      <h3>近 6 个月收支</h3>
                      <MonthlyBars data={series} currency={settings.currency} />
                    </section>
                  </div>
                )}
              </>
            )}

            {tab === 'details' &&
              (byDay.length === 0 ? (
                <div className="empty">本月无明细</div>
              ) : (
                <div className="details">
                  {byDay.map(([day, list]) => (
                    <div key={day} className="day-group">
                      <div className="day-header">{dayLabel(day)}</div>
                      {list.map((t) => (
                        <button key={t.uuid} className="txn-row" onClick={() => jump(t)} title="点击跳转到日志">
                          <span className="txn-title">{t.title || '(无备注)'}</span>
                          <span className="chip">{t.category || '未分类'}</span>
                          {t.account && <span className="chip muted">{t.account}</span>}
                          <span className={`txn-amount ${t.type === TYPE_INCOME ? 'income' : 'expense'}`}>
                            {t.type === TYPE_INCOME ? '+' : '-'}
                            {settings.currency}
                            {fmtMoney(t.amount)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}

            {tab === 'budget' && <BudgetTab summary={summary} settings={settings} />}
          </>
        )}
      </div>

      <div className="panel-footer">已加载 {txns.length} 条账单（全部日志页）</div>
    </div>
  )
}

function BudgetTab({ summary, settings }: { summary: MonthSummary; settings: AccountingSettings }) {
  const [budgets, setBudgets] = useState<Record<string, number>>({ ...settings.budgets })
  const [saving, setSaving] = useState(false)

  // 设置里的分类 ∪ 本月实际出现过的分类
  const cats = useMemo(() => {
    const set = new Set<string>(settings.expenseCategories)
    for (const c of Object.keys(summary.byCategory)) set.add(c)
    return [...set]
  }, [settings.expenseCategories, summary.byCategory])

  async function save() {
    setSaving(true)
    try {
      const cleaned: Record<string, number> = {}
      for (const [k, v] of Object.entries(budgets)) {
        const n = Number(v)
        if (k.trim() && Number.isFinite(n) && n > 0) cleaned[k.trim()] = n
      }
      await sdk.updateSettings({ budgets: JSON.stringify(cleaned) })
      sdk.UI.showMsg('预算已保存 ✓', 'success', { timeout: 1800 })
    } catch (e) {
      console.error('[logseq-accounting] save budgets failed', e)
      sdk.UI.showMsg('预算保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="budget">
      <p className="hint">为支出分类设置每月预算（0 或留空表示不设限）。进度按当前显示月份计算。</p>
      {cats.map((cat) => {
        const spent = summary.byCategory[cat] ?? 0
        const b = Number(budgets[cat]) || 0
        const pct = b > 0 ? Math.min(spent / b, 1) : spent > 0 ? 1 : 0
        const over = b > 0 && spent > b
        return (
          <div key={cat} className="budget-row">
            <div className="budget-head">
              <span className="budget-cat">{cat}</span>
              <span className={`budget-num ${over ? 'over' : ''}`}>
                {settings.currency}
                {fmtMoney(spent)}
                {b > 0 ? ` / ${settings.currency}${fmtMoney(b)}` : ''}
              </span>
            </div>
            <div className="budget-main">
              <div className="progress">
                <div className={`progress-fill ${over ? 'over' : ''}`} style={{ width: `${pct * 100}%` }} />
              </div>
              <input
                className="budget-input"
                type="number"
                min={0}
                step={50}
                placeholder="月预算"
                value={(budgets[cat] ?? 0) || ''}
                onChange={(e) =>
                  setBudgets({ ...budgets, [cat]: e.target.value === '' ? 0 : Number(e.target.value) })
                }
              />
            </div>
          </div>
        )
      })}
      <div className="form-actions">
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存预算'}
        </button>
      </div>
    </div>
  )
}
