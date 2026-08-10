import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSettings } from '../logseq/settings'
import { submitTxn, updateTxn, TxnWriteError, type TxnMode } from '../logseq/commands'
import { closeUI, type EditableTxn } from './store'
import { sdk } from '../logseq/sdk'
import ComboInput from './ComboInput'

export default function TxnForm({
  mode,
  blockUuid,
  intent,
  initial,
}: {
  mode: TxnMode
  blockUuid: string
  intent: 'create' | 'edit'
  initial?: EditableTxn
}) {
  const settings = getSettings()
  const english = settings.language === 'en'
  const cats = mode === 'expense' ? settings.expenseCategories : settings.incomeCategories

  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [category, setCategory] = useState(initial?.category ?? cats[0] ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  const title = english
    ? intent === 'edit' ? `Edit ${mode}` : mode === 'expense' ? 'Record an expense' : 'Record income'
    : intent === 'edit' ? `编辑${mode === 'expense' ? '支出' : '收入'}` : mode === 'expense' ? '记一笔支出' : '记一笔收入'

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    const n = Number(amount)
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) {
      setError(english ? 'Enter an amount greater than 0.' : '请输入正确的金额（大于 0 的数字）')
      return
    }
    const normalizedAmount = Math.round(n * 100) / 100
    setBusy(true)
    setError('')
    try {
      const save = intent === 'edit' ? updateTxn : submitTxn
      const result = await save(blockUuid, {
        mode,
        amount: normalizedAmount,
        category: category.trim(),
        note: note.trim(),
        currency: settings.currency,
        decimalPlaces: settings.decimalPlaces,
      })
      if (result.warnings.length) {
        console.warn('[logseq-accounting] saved with warnings', result)
        sdk.UI.showMsg('账单已保存，但标签或块位置处理失败，请检查当前日志。', 'warning', { timeout: 3500 })
      } else {
        sdk.UI.showMsg(intent === 'edit' ? '账单已更新 ✓' : `已记账 ✓ ${settings.currency}${normalizedAmount}`, 'success', { timeout: 1800 })
      }
      closeUI()
    } catch (err) {
      console.error('[logseq-accounting] submit failed', err)
      if (intent === 'edit') {
        setError(`修改未完整保存（${err instanceof TxnWriteError ? err.stage : '未知步骤'}），请检查后再试。`)
        setBusy(false)
      } else if (err instanceof TxnWriteError && err.blockUuid) {
        const retained = err.markedIncomplete
          ? '已保留并标记账单块'
          : `已保留账单块（UUID: ${err.blockUuid}），但未能添加警告标记`
        sdk.UI.showMsg(`账单未完整保存（${err.stage}），${retained}，请手动检查，不要重复提交。`, 'error', { timeout: 6000 })
        closeUI()
      } else {
        setError('未能创建账单，原块未改动，请重试。')
        setBusy(false)
      }
    }
  }

  return (
    <div className="panel form-panel" role="dialog" aria-label={title}>
      <div className="panel-header">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={closeUI} aria-label={english ? 'Close' : '关闭'}>
          ✕
        </button>
      </div>
      <form onSubmit={onSubmit} className="form-body">
        <label className="field">
          <span>{english ? 'Amount *' : '金额 *'}</span>
          <div className="amount-row">
            <span className="currency">{settings.currency}</span>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              step={10 ** -settings.decimalPlaces}
              min="0"
              placeholder={(0).toFixed(settings.decimalPlaces)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </label>
        <label className="field">
          <span>{english ? 'Category' : '分类'}</span>
          <ComboInput
            value={category}
            onChange={setCategory}
            options={cats}
            placeholder={english ? 'Choose or enter a category' : '选择或输入新分类'}
            ariaLabel={english ? 'Category' : '分类'}
          />
        </label>
        <label className="field">
          <span>{english ? 'Note' : '备注'}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={english ? 'e.g. Lunch with colleagues' : '如：午餐 和同事'}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={closeUI} disabled={busy}>
            {english ? 'Cancel' : '取消'}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? (english ? 'Saving…' : '保存中…') : intent === 'edit' ? (english ? 'Save changes (Enter)' : '保存修改 (Enter)') : (english ? 'Save (Enter)' : '保存 (Enter)')}
          </button>
        </div>
      </form>
    </div>
  )
}
