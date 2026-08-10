import { useMemo, useState, type MouseEvent } from 'react'
import {
  assetTotals,
  defaultAssetSnapshot,
  reviveItem,
  saveAssetSnapshot,
  type AssetGroup,
  type AssetSide,
  type AssetSnapshot,
} from '../logseq/assets'
import { getSettings } from '../logseq/settings'
import { sdk } from '../logseq/sdk'
import { closeUI } from './store'

type MenuTarget = { kind: 'group'; groupId: string } | { kind: 'item'; groupId: string; itemId: string }
type EditorState = {
  action: 'add-group' | 'add-item' | 'rename-group' | 'rename-item'
  side?: AssetSide
  groupId?: string
  itemId?: string
  value: string
}

const money = (amount: number, decimalPlaces: number): string => amount.toLocaleString('zh-CN', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })

export default function AssetInventory({ blockUuid, snapshots }: { blockUuid: string; snapshots: AssetSnapshot[] }) {
  const settings = getSettings()
  const { currency, decimalPlaces } = settings
  const english = settings.language === 'en'
  const amountPattern = decimalPlaces === 0 ? /^\d*$/ : new RegExp(`^\\d*(?:\\.\\d{0,${decimalPlaces}})?$`)
  const amountFactor = 10 ** decimalPlaces
  const [snapshot, setSnapshot] = useState<AssetSnapshot>(() =>
    snapshots[0] ? structuredClone(snapshots[0]) : defaultAssetSnapshot(settings.language),
  )
  const [menu, setMenu] = useState<(MenuTarget & { x: number; y: number }) | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const totals = useMemo(() => assetTotals(snapshot), [snapshot])

  const mutateGroups = (work: (groups: AssetGroup[]) => void) => {
    const groups = structuredClone(snapshot.groups)
    work(groups)
    setSnapshot({ ...snapshot, groups })
  }

  const addGroup = (side: AssetSide) => {
    setEditor({ action: 'add-group', side, value: '' })
  }

  const addItem = (group: AssetGroup) => {
    setEditor({ action: 'add-item', groupId: group.id, value: '' })
  }

  const openMenu = (event: MouseEvent, target: MenuTarget) => {
    event.preventDefault()
    setMenu({ ...target, x: event.clientX, y: event.clientY })
  }

  const renameTarget = () => {
    if (!menu) return
    const group = snapshot.groups.find((entry) => entry.id === menu.groupId)
    if (menu.kind === 'group' && group) setEditor({ action: 'rename-group', groupId: group.id, value: group.name })
    if (menu.kind === 'item' && group) {
      const item = group.items.find((entry) => entry.id === menu.itemId)
      if (item) setEditor({ action: 'rename-item', groupId: group.id, itemId: item.id, value: item.name })
    }
    setMenu(null)
  }

  const commitEditor = () => {
    if (!editor) return
    const name = editor.value.trim()
    if (!name) return
    mutateGroups((groups) => {
      if (editor.action === 'add-group' && editor.side) {
        if (!groups.some((group) => group.side === editor.side && group.name === name)) {
          groups.push({ id: crypto.randomUUID(), side: editor.side, name, items: [] })
        }
        return
      }
      const group = groups.find((entry) => entry.id === editor.groupId)
      if (!group) return
      if (editor.action === 'add-item') {
        if (!group.items.some((item) => item.name === name)) {
          group.items.push(reviveItem(snapshots, group.side, group.name, name) ?? { id: crypto.randomUUID(), name, amount: 0 })
        }
      } else if (editor.action === 'rename-group') group.name = name
      else {
        const item = group.items.find((entry) => entry.id === editor.itemId)
        if (item) item.name = name
      }
    })
    setEditor(null)
  }

  const deleteTarget = () => {
    if (!menu) return
    mutateGroups((groups) => {
      const index = groups.findIndex((entry) => entry.id === menu.groupId)
      if (index < 0) return
      if (menu.kind === 'group') groups.splice(index, 1)
      else groups[index].items = groups[index].items.filter((entry) => entry.id !== menu.itemId)
    })
    setMenu(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveAssetSnapshot(blockUuid, { ...snapshot, recordedAt: Date.now() }, settings)
      sdk.UI.showMsg(english ? 'Asset snapshot saved' : '资产盘点已保存', 'success', { timeout: 1800 })
      closeUI()
    } catch (cause) {
      console.error('[logseq-accounting] asset snapshot failed', cause)
      const detail = cause instanceof Error ? cause.message : String(cause)
      sdk.UI.showMsg(english ? `Could not save asset snapshot: ${detail}` : `资产盘点保存失败：${detail}`, 'error')
      setSaving(false)
    }
  }

  const column = (side: AssetSide, title: string) => (
    <section className="asset-column">
      <div className="asset-column-head">
        <div><span className="eyebrow">{side === 'asset' ? 'ASSETS' : 'LIABILITIES'}</span><h3>{title}</h3></div>
        <button className="icon-btn" onClick={() => addGroup(side)} aria-label={english ? `Add ${title} group` : `添加${title}父类`}>＋</button>
      </div>
      {snapshot.groups.filter((group) => group.side === side).map((group) => (
        <div className="asset-group" key={group.id} onContextMenu={(event) => openMenu(event, { kind: 'group', groupId: group.id })}>
          <div className="asset-group-head">
            <strong>{group.name}</strong>
            <div>
              <button className="mini-btn" onClick={() => addItem(group)} aria-label={english ? `Add item to ${group.name}` : `在${group.name}添加子类`}>＋</button>
              <button className="mini-btn" onClick={(event) => openMenu(event, { kind: 'group', groupId: group.id })} aria-label={english ? `${group.name} menu` : `${group.name}菜单`}>⋯</button>
            </div>
          </div>
          {group.items.length === 0 && <div className="asset-empty">{english ? 'Select + to add an item' : '点击＋添加子类'}</div>}
          {group.items.map((item) => (
            <div className="asset-item" key={item.id} onContextMenu={(event) => openMenu(event, { kind: 'item', groupId: group.id, itemId: item.id })}>
              <div className="asset-item-name"><span>{item.name}</span>{snapshots[0] && <small>{english ? 'Previous ' : '上次 '}{currency}{(() => { const value = snapshots[0].groups.find((entry) => entry.id === group.id)?.items.find((entry) => entry.id === item.id)?.amount; return value == null ? '—' : money(value, decimalPlaces) })()}</small>}</div>
              <label className="asset-amount"><span>{currency}</span><input inputMode="decimal" value={amountDrafts[item.id] ?? item.amount.toFixed(decimalPlaces)} onFocus={() => setAmountDrafts((drafts) => ({ ...drafts, [item.id]: item.amount.toFixed(decimalPlaces) }))} onChange={(event) => {
                const value = event.target.value
                if (!amountPattern.test(value)) return
                setAmountDrafts((drafts) => ({ ...drafts, [item.id]: value }))
                if (value !== '' && value !== '.') mutateGroups((groups) => {
                  const target = groups.find((entry) => entry.id === group.id)?.items.find((entry) => entry.id === item.id)
                  if (target) target.amount = Math.round(Math.max(0, Number(value) || 0) * amountFactor) / amountFactor
                })
              }} onBlur={() => setAmountDrafts((drafts) => { const next = { ...drafts }; delete next[item.id]; return next })} /></label>
              <button className="mini-btn" onClick={(event) => openMenu(event, { kind: 'item', groupId: group.id, itemId: item.id })} aria-label={english ? `${item.name} menu` : `${item.name}菜单`}>⋯</button>
            </div>
          ))}
        </div>
      ))}
    </section>
  )

  return (
    <div className="panel asset-panel" role="dialog" aria-label={english ? 'Asset inventory' : '资产盘点'} onMouseDown={() => menu && setMenu(null)}>
      <div className="panel-header"><div className="dash-heading"><span className="dash-kicker">BALANCE CHECK</span><h2>{english ? 'Asset inventory' : '资产盘点'}</h2></div><button className="icon-btn" onClick={closeUI} aria-label={english ? 'Close' : '关闭'}>✕</button></div>
      <div className="asset-summary"><div><span>{english ? 'Assets' : '总资产'}</span><strong className="income">{currency}{money(totals.assets, decimalPlaces)}</strong></div><div><span>{english ? 'Liabilities' : '总负债'}</span><strong className="expense">{currency}{money(totals.liabilities, decimalPlaces)}</strong></div><div><span>{english ? 'Net worth' : '净资产'}</span><strong>{currency}{money(totals.net, decimalPlaces)}</strong></div>{snapshots[0] && <small>{english ? 'Previous snapshot: ' : '上次盘点：'}{new Date(snapshots[0].recordedAt).toLocaleString(english ? 'en' : 'zh-CN')}</small>}</div>
      <div className="asset-grid">{column('asset', english ? 'Assets' : '资产')}{column('liability', english ? 'Liabilities' : '负债')}</div>
      <div className="asset-footer"><span>{english ? 'Saving creates an asset snapshot in today’s journal.' : '保存后会在今日日志生成一条资产快照。'}</span><div className="form-actions"><button className="btn ghost" onClick={closeUI}>{english ? 'Cancel' : '取消'}</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? (english ? 'Saving…' : '保存中…') : (english ? 'Save snapshot' : '保存本次盘点')}</button></div></div>
      {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.stopPropagation()}><button onClick={renameTarget}>{english ? 'Rename' : '重命名'}</button><button className="danger" onClick={deleteTarget}>{english ? 'Delete' : '删除'}</button></div>}
      {editor && <div className="asset-editor-backdrop" onMouseDown={() => setEditor(null)}><form className="asset-editor" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); commitEditor() }}><h3>{editor.action.startsWith('add') ? (english ? 'Add category' : '添加分类') : (english ? 'Rename' : '重命名')}</h3><input autoFocus value={editor.value} placeholder={english ? 'Enter a name' : '请输入名称'} onChange={(event) => setEditor({ ...editor, value: event.target.value })} /><div className="form-actions"><button type="button" className="btn ghost" onClick={() => setEditor(null)}>{english ? 'Cancel' : '取消'}</button><button type="submit" className="btn primary" disabled={!editor.value.trim()}>{english ? 'Confirm' : '确定'}</button></div></form></div>}
    </div>
  )
}
