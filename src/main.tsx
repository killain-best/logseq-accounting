import '@logseq/libs'
import './styles.css'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { store } from './ui/store'
import { sdk } from './logseq/sdk'
import { ensureSchema } from './logseq/schema'
import { setupSettings } from './logseq/settings'
import type { TxnMode } from './logseq/commands'

function openForm(mode: TxnMode, blockUuid: string) {
  store.set({ kind: 'form', mode, blockUuid })
  sdk.showMainUI({ autoFocus: true })
}

function openDashboard() {
  store.set({ kind: 'dashboard' })
  sdk.showMainUI({ autoFocus: true })
}

/** 日志里的记账块卡片化样式 */
function injectBlockStyles() {
  sdk.provideStyle({
    key: 'logseq-accounting-blocks',
    style: `
      .ls-block:has(a.tag[data-ref="账单"]) {
        background: var(--ls-secondary-background-color, rgba(125, 125, 125, 0.06));
        border: 1px solid var(--ls-border-color, rgba(125, 125, 125, 0.25));
        border-left: 3px solid var(--ls-accent-color, #3b82f6);
        border-radius: 8px;
        padding: 2px 10px;
        margin: 2px 0;
      }
    `,
  })
}

async function main() {
  setupSettings()

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

  // 工具栏按钮
  sdk.provideModel({ openDashboard })
  sdk.App.registerUIItem('toolbar', {
    key: 'logseq-accounting',
    template: `<a data-on-click="openDashboard" class="button" title="记账报表" style="font-size:18px;display:inline-flex;align-items:center;justify-content:center">💰</a>`,
  })

  // 斜杠命令（英文）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk.Editor.registerSlashCommand('expense', async (e: any) => {
    if (e?.uuid) openForm('expense', e.uuid)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk.Editor.registerSlashCommand('income', async (e: any) => {
    if (e?.uuid) openForm('income', e.uuid)
  })
  sdk.Editor.registerSlashCommand('记账报表', async () => {
    openDashboard()
  })

  // Logseq 侧关闭主 UI 时同步内部状态
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk.App.onMainUIChanged?.(({ visible }: any) => {
    if (!visible) store.set({ kind: 'hidden' })
  })

  injectBlockStyles()
}

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(<App />)
}

sdk.ready(main).catch((e: unknown) => console.error('[logseq-accounting] init failed', e))
