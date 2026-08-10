import { getSettings } from '../logseq/settings'
import { sdk } from '../logseq/sdk'
import { closeUI } from './store'

const COMMANDS = [
  ['/expense', '记录支出', 'Record an expense'],
  ['/income', '记录收入', 'Record income'],
  ['/assets', '盘点资产与负债', 'Review assets and liabilities'],
  ['/edit', '编辑当前账单', 'Edit the current transaction'],
  ['/report', '打开记账报表', 'Open the accounting report'],
] as const

export default function Onboarding() {
  const english = getSettings().language === 'en'
  const finish = async () => {
    await sdk.updateSettings({ showOnboarding: false })
    closeUI()
  }
  return <section className="panel onboarding-panel" role="dialog" aria-labelledby="onboarding-title"><header><span className="onboarding-icon"><i className="ti ti-report-money" /></span><div><span className="eyebrow">LOGSEQ ACCOUNTING</span><h2 id="onboarding-title">{english ? 'Accounting, inside your journal' : '在日志里完成记账'}</h2></div></header><p>{english ? 'Use slash commands on any journal page. Transactions and asset snapshots stay in your Logseq graph.' : '在任意日志页输入斜杠命令。账单和资产快照都会保存在你的 Logseq graph 中。'}</p><div className="onboarding-commands">{COMMANDS.map(([command, zh, en]) => <div key={command}><code>{command}</code><span>{english ? en : zh}</span></div>)}</div><div className="onboarding-tip"><i className="ti ti-bulb" /><span>{english ? 'Open the monthly report from the report icon in the Logseq toolbar. Hover a transaction and choose Edit, or right-click it.' : '点击 Logseq 工具栏中的报表图标查看月度报表。修改账单时，可悬停后点击“编辑”，也可以右键账单块。'}</span></div><footer><button className="btn ghost" onClick={closeUI}>{english ? 'Later' : '稍后'}</button><button className="btn primary" onClick={() => void finish()}>{english ? 'Start accounting' : '开始记账'}</button></footer></section>
}
