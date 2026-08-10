import { useEffect, useMemo, useState } from 'react'
import { sdk } from '../logseq/sdk'
import { closeUI } from './store'
import { getSettings } from '../logseq/settings'
import {
  summarizePeriod,
  periodSeries,
  currentDay,
  shiftPeriod,
  periodRange,
  dayLabel,
  type Txn,
} from '../logseq/query'
import { Donut, MonthlyBars } from './charts'
import { TYPE_INCOME } from '../logseq/schema'
import { useTxnData } from './useTxnData'
import { assetTotals, queryAssetSnapshots, type AssetSnapshot } from '../logseq/assets'
import { Money } from './Money'

type Tab = 'overview' | 'details' | 'assets'

export default function Dashboard() {
  const settings = getSettings()
  const english = settings.language === 'en'
  const { txns, loading, refreshing, error } = useTxnData()
  const [anchor, setAnchor] = useState(currentDay())
  const [tab, setTab] = useState<Tab>('overview')
  const [assetSnapshots, setAssetSnapshots] = useState<AssetSnapshot[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc')

  const summary = useMemo(() => summarizePeriod(txns, 'month', anchor), [txns, anchor])
  const series = useMemo(() => periodSeries(txns, 'month', anchor, 6), [txns, anchor])
  const range = useMemo(() => periodRange('month', anchor), [anchor])
  const periodLabel = english
    ? new Date(Math.floor(anchor / 100), anchor % 100 - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
    : range.label
  const uncategorized = english ? 'Uncategorized' : '未分类'
  useEffect(() => { void queryAssetSnapshots().then(setAssetSnapshots).catch((cause) => console.warn('[logseq-accounting] asset query failed', cause)) }, [])
  const catData = useMemo(
    () =>
      Object.entries(summary.byCategory)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    [summary],
  )
  const categories = useMemo(() => [...new Set(summary.txns.map((txn) => txn.category || uncategorized))].sort(), [summary.txns, uncategorized])
  const filteredTxns = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('zh-CN')
    return summary.txns.filter((txn) => {
      if (typeFilter === 'income' && txn.type !== TYPE_INCOME) return false
      if (typeFilter === 'expense' && txn.type === TYPE_INCOME) return false
      if (categoryFilter !== 'all' && (txn.category || uncategorized) !== categoryFilter) return false
      return !needle || `${txn.title} ${txn.category}`.toLocaleLowerCase('zh-CN').includes(needle)
    })
  }, [summary.txns, search, typeFilter, categoryFilter, uncategorized])
  const sortedTxns = useMemo(() => [...filteredTxns].sort((a, b) => {
    if (sort === 'amount-asc') return a.amount - b.amount || b.journalDay - a.journalDay
    if (sort === 'amount-desc') return b.amount - a.amount || b.journalDay - a.journalDay
    if (sort === 'date-asc') return a.journalDay - b.journalDay || b.amount - a.amount
    return b.journalDay - a.journalDay || b.amount - a.amount
  }), [filteredTxns, sort])

  async function jump(t: Txn) {
    closeUI()
    try {
      await sdk.Editor.scrollToBlockInPage(t.pageName, t.uuid)
    } catch (e) {
      console.warn('[logseq-accounting] jump failed', e)
    }
  }

  return (
    <div className="panel dash-panel" role="dialog" aria-label={english ? 'Accounting report' : '记账报表'}>
      <div className="panel-header">
        <div className="dash-heading">
          <span className="dash-kicker">{english ? 'CASH FLOW' : '现金流'}</span>
          <h2>{english ? 'Accounting report' : '记账报表'}</h2>
        </div>
        <button className="icon-btn" onClick={closeUI} aria-label={english ? 'Close' : '关闭'}>
          ✕
        </button>
      </div>

      <div className="tabs">
        {(
          [
            ['overview', english ? 'Overview' : '概览'],
            ['details', english ? 'Transactions' : '明细'],
            ['assets', english ? 'Assets' : '资产'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {loading ? (
          <div className="empty">{english ? 'Loading…' : '加载中…'}</div>
        ) : error && txns.length === 0 ? (
          <div className="empty">{error}</div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                <div className="overview-period"><button className="icon-btn" onClick={() => setAnchor(shiftPeriod('month', anchor, -1))} aria-label={english ? 'Previous month' : '上个月'}>‹</button><strong>{periodLabel}</strong><button className="icon-btn" onClick={() => setAnchor(shiftPeriod('month', anchor, 1))} aria-label={english ? 'Next month' : '下个月'}>›</button></div>
                <div className="balance-hero">
                  <div className="balance-primary">
                    <span className="eyebrow">{english ? 'MONTHLY BALANCE' : '本月结余'}</span>
                    <strong className={summary.income - summary.expense >= 0 ? 'positive' : 'negative'}>
                      <small>{settings.currency}</small>
                      <Money amount={summary.income - summary.expense} />
                    </strong>
                    <span className="balance-caption">
                      {summary.income - summary.expense >= 0 ? (english ? 'Income covered this month’s expenses' : '收入覆盖了本期支出') : (english ? 'Expenses exceeded income this month' : '本期支出高于收入')}
                    </span>
                  </div>
                  <dl className="money-pairs">
                    <div>
                      <dt>{english ? 'Income' : '收入'}</dt>
                      <dd className="income">+{settings.currency}<Money amount={summary.income} /></dd>
                    </div>
                    <div>
                      <dt>{english ? 'Expenses' : '支出'}</dt>
                      <dd className="expense">−{settings.currency}<Money amount={summary.expense} /></dd>
                    </div>
                  </dl>
                </div>
                {summary.txns.length === 0 ? (
                  <div className="empty">
                    {english ? 'No transactions this month.' : '本期还没有账单。'}
                    <br />
                    {english ? <>Enter <code>/expense</code> on a journal page to begin.</> : <>在日志页输入 <code>/expense</code> 开始记一笔吧。</>}
                  </div>
                ) : (
                  <div className="overview-grid">
                    <section className="report-section category-section">
                      <h3>{english ? 'Expenses by category' : '分类支出'}</h3>
                      {catData.length ? (
                        <Donut data={catData} currency={settings.currency} />
                      ) : (
                        <div className="empty">{english ? 'No expenses this month' : '本月只有收入，没有支出'}</div>
                      )}
                    </section>
                    <section className="report-section trend-section">
                      <h3>{english ? 'Last 6 months' : '近 6 个月收支'}</h3>
                      <MonthlyBars data={series} currency={settings.currency} />
                    </section>
                  </div>
                )}
              </>
            )}

            {tab === 'details' && (
              <div className="details">
                  <div className="detail-filters">
                    <label className="detail-search"><span className="sr-only">{english ? 'Search transactions' : '搜索明细'}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={english ? 'Search note or category' : '搜索说明或分类'} /></label>
                    <select aria-label={english ? 'Transaction type' : '收支类型'} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">{english ? 'All types' : '全部收支'}</option><option value="expense">{english ? 'Expenses only' : '仅支出'}</option><option value="income">{english ? 'Income only' : '仅收入'}</option></select>
                    <select aria-label={english ? 'Category' : '分类'} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">{english ? 'All categories' : '全部分类'}</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>
                    <select aria-label={english ? 'Sort' : '排序方式'} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date-desc">{english ? 'Date: newest' : '日期：新到旧'}</option><option value="date-asc">{english ? 'Date: oldest' : '日期：旧到新'}</option><option value="amount-desc">{english ? 'Amount: high to low' : '金额：高到低'}</option><option value="amount-asc">{english ? 'Amount: low to high' : '金额：低到高'}</option></select>
                    <span className="filter-count">{sortedTxns.length} {english ? 'items' : '条'}</span>
                  </div>
                  {sortedTxns.length === 0 ? <div className="empty">{english ? 'No matching transactions' : '没有符合条件的明细'}</div> : <><div className="txn-columns" aria-hidden="true"><span>{english ? 'Date' : '日期'}</span><span>{english ? 'Note' : '说明'}</span><span>{english ? 'Category' : '分类'}</span><span>{english ? 'Amount' : '金额'}</span></div>{sortedTxns.map((t) => (
                        <button key={t.uuid} className="txn-row" onClick={() => jump(t)} title={english ? 'Open in journal' : '点击跳转到日志'}>
                          <span className="txn-date">{english ? formatEnglishDay(t.journalDay) : dayLabel(t.journalDay)}</span>
                          <span className="txn-title">{t.title || (english ? '(No note)' : '(无备注)')}</span>
                          <span className="chip">{t.category || uncategorized}</span>
                          <span className={`txn-amount ${t.type === TYPE_INCOME ? 'income' : 'expense'}`}>
                            {t.type === TYPE_INCOME ? '+' : '-'}
                            {settings.currency}
                            <Money amount={t.amount} />
                          </span>
                        </button>
                  ))}</>}
              </div>
            )}

            {tab === 'assets' && <AssetPage txns={txns} snapshots={assetSnapshots} currency={settings.currency} english={english} />}
          </>
        )}
      </div>

      <div className="panel-footer">
        {refreshing ? (english ? 'Updating…' : '正在更新…') : (english ? `${txns.length} transactions loaded from journal pages` : `已加载 ${txns.length} 条账单（全部日志页）`)}
        {error && txns.length > 0 ? ` · ${error}` : ''}
      </div>
    </div>
  )
}

function formatEnglishDay(day: number): string {
  return new Date(Math.floor(day / 10000), Math.floor((day % 10000) / 100) - 1, day % 100)
    .toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function AssetPage({ txns, snapshots, currency, english }: { txns: Txn[]; snapshots: AssetSnapshot[]; currency: string; english: boolean }) {
  const latest = snapshots[0]
  const totals = latest ? assetTotals(latest) : { assets: 0, liabilities: 0, net: 0 }
  return <div className="asset-page"><div className="asset-top-grid"><FinanceCalendar txns={txns} snapshots={snapshots} english={english} /><section className="networth-equation"><div className="equation-heading"><span className="eyebrow">{english ? 'NET WORTH' : '净资产'}</span><h3>{english ? 'Net worth' : '净资产'}</h3>{latest && <small>{english ? 'Updated ' : '更新于 '}{new Date(latest.recordedAt).toLocaleString(english ? 'en' : 'zh-CN')}</small>}</div><div className="equation"><div className="equation-row"><span>{english ? 'Assets' : '总资产'}</span><strong>{currency}<Money amount={totals.assets} /></strong></div><div className="equation-row subtract"><i>−</i><span>{english ? 'Liabilities' : '总负债'}</span><strong>{currency}<Money amount={totals.liabilities} /></strong></div><div className="equation-rule" /><div className="equation-row result"><span>= {english ? 'Net worth' : '净资产'}</span><strong>{currency}<Money amount={totals.net} /></strong></div></div>{!latest && <p>{english ? <>No snapshot yet. Enter <code>/assets</code> in a journal.</> : <>尚未盘点资产，请在日志中输入 <code>/assets</code>。</>}</p>}</section></div><AssetOverview snapshots={snapshots} currency={currency} english={english} /></div>
}

function toDay(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

function FinanceCalendar({ txns, snapshots, english }: { txns: Txn[]; snapshots: AssetSnapshot[]; english: boolean }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return now.getFullYear() * 100 + now.getMonth() + 1 })
  const year = Math.floor(month / 100)
  const monthIndex = month % 100 - 1
  const first = new Date(year, monthIndex, 1)
  const days = new Date(year, monthIndex + 1, 0).getDate()
  const leading = (first.getDay() + 6) % 7
  const statuses = useMemo(() => {
    const map = new Map<number, { income: boolean; expense: boolean; asset: boolean }>()
    for (const txn of txns) {
      const status = map.get(txn.journalDay) ?? { income: false, expense: false, asset: false }
      if (txn.type === TYPE_INCOME) status.income = true
      else status.expense = true
      map.set(txn.journalDay, status)
    }
    for (const snapshot of snapshots) {
      const day = toDay(new Date(snapshot.recordedAt))
      const status = map.get(day) ?? { income: false, expense: false, asset: false }
      status.asset = true
      map.set(day, status)
    }
    return map
  }, [txns, snapshots])
  const cells: Array<number | null> = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= days; day += 1) cells.push(day)
  while (cells.length % 7) cells.push(null)
  const shift = (delta: number) => { const date = new Date(year, monthIndex + delta, 1); setMonth(date.getFullYear() * 100 + date.getMonth() + 1) }
  const openDay = async (day: number) => {
    const date = new Date(year, monthIndex, day)
    try {
      const page = await sdk.Editor.createJournalPage(date.getTime())
      const name = page?.name ?? page?.uuid
      if (!name) throw new Error('无法创建或读取日志页')
      closeUI()
      await sdk.App.pushState('page', { name })
    } catch (cause) {
      console.warn('[logseq-accounting] open calendar day failed', cause)
      void sdk.UI.showMsg('无法打开当天日志', 'error')
    }
  }
  return <section className="finance-calendar"><header><div><span className="eyebrow">FINANCIAL CALENDAR</span><h3>{english ? 'Financial calendar' : '财务日历'}</h3></div><div className="calendar-nav"><button className="icon-btn" onClick={() => shift(-1)} aria-label={english ? 'Previous month' : '上个月'}>‹</button><strong>{english ? `${year}/${monthIndex + 1}` : `${year}年${monthIndex + 1}月`}</strong><button className="icon-btn" onClick={() => shift(1)} aria-label={english ? 'Next month' : '下个月'}>›</button></div><div className="calendar-legend"><span><i className="expense">★</i>{english ? 'Expense' : '支出'}</span><span><i className="income">★</i>{english ? 'Income' : '收入'}</span><span><i className="asset">★</i>{english ? 'Snapshot' : '盘点'}</span></div></header><div className="calendar-grid">{(english ? ['M','T','W','T','F','S','S'] : ['一','二','三','四','五','六','日']).map((label, index) => <span className="calendar-weekday" key={`${label}-${index}`}>{label}</span>)}{cells.map((day, index) => day == null ? <span className="calendar-pad" key={`pad-${index}`} /> : (() => { const key = year * 10000 + (monthIndex + 1) * 100 + day; const status = statuses.get(key); const labels = [status?.expense && (english ? 'expense' : '有支出'), status?.income && (english ? 'income' : '有收入'), status?.asset && (english ? 'asset snapshot' : '有资产盘点')].filter(Boolean).join(english ? ', ' : '、'); return <button className={`calendar-day ${key === toDay(new Date()) ? 'today' : ''}`} key={key} onClick={() => void openDay(day)} aria-label={`${monthIndex + 1}/${day}${labels ? `, ${labels}` : ''}`}><span>{day}</span><b>{status?.expense && <i className="expense">★</i>}{status?.income && <i className="income">★</i>}{status?.asset && <i className="asset">★</i>}</b></button> })())}</div></section>
}

function AssetOverview({ snapshots, currency, english }: { snapshots: AssetSnapshot[]; currency: string; english: boolean }) {
  const latest = snapshots[0]
  if (!latest) return <div className="empty">{english ? <>No asset snapshot yet.<br />Enter <code>/assets</code> in a journal.</> : <>尚未盘点资产。<br />在日志中输入 <code>/assets</code> 开始。</>}</div>
  const totals = assetTotals(latest)
  const assetGroups = latest.groups.filter((group) => group.side === 'asset')
  const liabilityGroups = latest.groups.filter((group) => group.side === 'liability')
  const groups = (entries: typeof latest.groups, side: 'asset' | 'liability') => entries.map((group) => {
    const subtotal = group.items.reduce((sum, item) => sum + item.amount, 0)
    return <section className="balance-group" key={group.id}><div className="balance-group-head"><h4>{group.name}</h4><strong>{currency}<Money amount={subtotal} /></strong></div><div className="balance-items">{group.items.length ? group.items.map((item) => <div className="balance-item" key={item.id}><span>{item.name}</span><b>{currency}<Money amount={item.amount} /></b></div>) : <span className="balance-empty">暂无项目</span>}</div><div className={`balance-group-rule ${side}`} /></section>
  })
  return <div className="asset-overview"><div className="balance-sheet"><section className="balance-side asset"><header><div><span>{english ? 'ASSETS' : '资产'}</span><h3>{english ? 'Assets' : '资产'}</h3></div><strong>{currency}<Money amount={totals.assets} /></strong></header>{groups(assetGroups, 'asset')}</section><section className="balance-side liability"><header><div><span>{english ? 'LIABILITIES' : '负债'}</span><h3>{english ? 'Liabilities' : '负债'}</h3></div><strong>{currency}<Money amount={totals.liabilities} /></strong></header>{groups(liabilityGroups, 'liability')}</section></div><p className="asset-update-note">{english ? <>Showing the latest snapshot · Enter <code>/assets</code> in a journal to update</> : <>资产页面仅展示最近一次盘点 · 在日志中输入 <code>/assets</code> 更新</>}</p></div>
}
