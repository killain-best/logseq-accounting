import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSettings } from '../logseq/settings'
import { submitTxn, type TxnMode } from '../logseq/commands'
import { closeUI } from './store'
import { sdk } from '../logseq/sdk'

export default function TxnForm({ mode, blockUuid }: { mode: TxnMode; blockUuid: string }) {
  const settings = getSettings()
  const cats = mode === 'expense' ? settings.expenseCategories : settings.incomeCategories

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(cats[0] ?? '')
  const [account, setAccount] = useState(settings.accounts[0] ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  const title = mode === 'expense' ? '记一笔支出 💸' : '记一笔收入 💰'

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    const n = Number(amount)
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) {
      setError('请输入正确的金额（大于 0 的数字）')
      return
    }
    setBusy(true)
    setError('')
    try {
      await submitTxn(blockUuid, {
        mode,
        amount: Math.round(n * 100) / 100,
        category: category.trim(),
        account: account.trim(),
        note: note.trim(),
      })
      sdk.UI.showMsg(`已记账 ✓ ${settings.currency}${n}`, 'success', { timeout: 1800 })
      closeUI()
    } catch (err) {
      console.error('[logseq-accounting] submit failed', err)
      setError('写入失败，请打开控制台查看详情')
      setBusy(false)
    }
  }

  return (
    <div className="panel form-panel" role="dialog" aria-label={title}>
      <div className="panel-header">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={closeUI} aria-label="关闭">
          ✕
        </button>
      </div>
      <form onSubmit={onSubmit} className="form-body">
        <label className="field">
          <span>金额 *</span>
          <div className="amount-row">
            <span className="currency">{settings.currency}</span>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </label>
        <label className="field">
          <span>分类</span>
          <input
            list="txn-cats"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="选择或输入新分类"
          />
          <datalist id="txn-cats">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>账户</span>
          <input
            list="txn-accs"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="选择或输入新账户"
          />
          <datalist id="txn-accs">
            {settings.accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>备注</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：午餐 和同事"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={closeUI} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '保存中…' : '保存 (Enter)'}
          </button>
        </div>
      </form>
    </div>
  )
}
