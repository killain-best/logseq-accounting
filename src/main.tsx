import '@logseq/libs'
import './styles.css'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { store } from './ui/store'
import { sdk } from './logseq/sdk'
import { ensureSchema } from './logseq/schema'
import { invalidateQueryCache, queryTxnByUuid } from './logseq/query'
import { restoreTxnTitles } from './logseq/titleSync'
import { setupBlockPresentation } from './logseq/blockPresentation'
import { getSettings, setupSettings, slashCommandName } from './logseq/settings'
import { noteFromTxnTitle, type TxnMode } from './logseq/commands'
import { TYPE_INCOME } from './logseq/schema'
import { queryAssetSnapshots } from './logseq/assets'

function openForm(mode: TxnMode, blockUuid: string) {
  store.set({ kind: 'form', intent: 'create', mode, blockUuid })
  sdk.showMainUI({ autoFocus: true })
}

async function openEditForm(blockUuid: string) {
  try {
    const txn = await queryTxnByUuid(blockUuid)
    if (!txn) {
      sdk.UI.showMsg('没有读取到这笔账单，请重载插件后再试。', 'warning')
      return
    }
    store.set({
      kind: 'form',
      intent: 'edit',
      mode: txn.type === TYPE_INCOME ? 'income' : 'expense',
      blockUuid,
      initial: {
        amount: txn.amount,
        category: txn.category,
        note: noteFromTxnTitle(txn.title),
      },
    })
    sdk.showMainUI({ autoFocus: true })
  } catch (cause) {
    console.error('[logseq-accounting] cannot open transaction editor', cause)
    sdk.UI.showMsg('读取账单失败，请重载插件后再试。', 'error')
  }
}

function openDashboard() {
  store.set({ kind: 'dashboard' })
  sdk.showMainUI({ autoFocus: true })
}

async function openAssets(blockUuid: string) {
  try {
    const snapshots = await queryAssetSnapshots()
    store.set({ kind: 'assets', blockUuid, snapshots })
    sdk.showMainUI({ autoFocus: true })
  } catch (cause) {
    console.error('[logseq-accounting] cannot open asset inventory', cause)
    sdk.UI.showMsg('无法读取资产盘点数据', 'error')
  }
}

/** 日志中只弱化账单标签，不改变 Logseq 原生块容器。 */
function injectBlockStyles() {
  sdk.provideStyle({
    key: 'logseq-accounting-blocks',
    style: `
      a.tag[data-ref="账单"] {
        color: var(--ls-secondary-text-color, currentColor);
        font-size: 0.78em;
        font-weight: 500;
        opacity: 0.58;
      }

      .logseq-accounting-own-properties {
        display: none !important;
      }

      .logseq-accounting-txn .block-content {
        cursor: text;
      }

      .logseq-accounting-edit-button {
        margin-left: 0.45em;
        padding: 1px 6px;
        border: 0;
        border-radius: 5px;
        background: var(--ls-secondary-background-color, transparent);
        color: var(--ls-secondary-text-color, currentColor);
        font-size: 0.72em;
        opacity: 0;
        cursor: pointer;
        transition: opacity 120ms ease;
      }

      .logseq-accounting-txn:hover .logseq-accounting-edit-button,
      .logseq-accounting-edit-button:focus-visible {
        opacity: 0.8;
      }
    `,
  })
}

async function main() {
  setupSettings()
  const settings = getSettings()
  const english = settings.language === 'en'

  // 主 UI 全屏覆盖，内部自己做毛玻璃遮罩 + 居中面板
  sdk.setMainUIInlineStyle({
    position: 'fixed',
    inset: '0px',
    width: '100vw',
    height: '100vh',
    zIndex: '999',
  })

  const ok = await ensureSchema()
  if (!ok) return
  invalidateQueryCache()

  // 工具栏按钮
  sdk.provideModel({ openDashboard })
  sdk.App.registerUIItem('toolbar', {
    key: 'logseq-accounting',
    template: `<a data-on-click="openDashboard" class="button" title="${english ? 'Accounting report' : '记账报表'}" aria-label="${english ? 'Open accounting report' : '打开记账报表'}"><i class="ti ti-report-money"></i></a>`,
  })

  // 斜杠命令（英文）
  sdk.Editor.registerSlashCommand(slashCommandName(settings.expenseCommand), async (e) => {
    if (e?.uuid) openForm('expense', e.uuid)
  })
  sdk.Editor.registerSlashCommand(slashCommandName(settings.incomeCommand), async (e) => {
    if (e?.uuid) openForm('income', e.uuid)
  })
  sdk.Editor.registerSlashCommand(slashCommandName(settings.assetsCommand), async (e) => {
    if (e?.uuid) await openAssets(e.uuid)
  })
  sdk.Editor.registerSlashCommand(slashCommandName(settings.reportCommand), async () => {
    openDashboard()
  })
  sdk.Editor.registerSlashCommand('恢复账单标题', async () => {
    try {
      const result = await restoreTxnTitles()
      const message = result.skipped
        ? '账单标题正在恢复，请稍后重试。'
        : `已检查 ${result.total} 笔账单，恢复 ${result.updated} 个标题。`
      sdk.UI.showMsg(message, result.skipped ? 'warning' : 'success', { timeout: 3200 })
    } catch (cause) {
      console.error('[logseq-accounting] title restore failed', cause)
      sdk.UI.showMsg(`恢复账单标题失败：${cause instanceof Error ? cause.message : String(cause)}`, 'error', { timeout: 6000 })
    }
  })
  sdk.Editor.registerBlockContextMenuItem(english ? 'Edit transaction' : '编辑账单', async (event) => {
    await openEditForm(event.uuid)
  })

  // Logseq 侧关闭主 UI 时同步内部状态
  sdk.App.onMainUIChanged?.(({ visible }) => {
    if (!visible) store.set({ kind: 'hidden' })
  })

  injectBlockStyles()
  setupBlockPresentation((blockUuid) => void openEditForm(blockUuid))

}

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(<App />)
}

sdk.ready(main).catch((e: unknown) => {
  console.error('[logseq-accounting] init failed', e)
  sdk.UI.showMsg('「日志记账」初始化失败，请重载插件并查看控制台。', 'error')
})
