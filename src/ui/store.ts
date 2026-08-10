import { sdk } from '../logseq/sdk'
import type { TxnMode } from '../logseq/commands'
import type { AssetSnapshot } from '../logseq/assets'

export interface EditableTxn {
  amount: number
  category: string
  note: string
}

export type ViewState =
  | { kind: 'hidden' }
  | { kind: 'form'; intent: 'create'; mode: TxnMode; blockUuid: string }
  | { kind: 'form'; intent: 'edit'; mode: TxnMode; blockUuid: string; initial: EditableTxn }
  | { kind: 'assets'; blockUuid: string; snapshots: AssetSnapshot[] }
  | { kind: 'dashboard' }
  | { kind: 'onboarding' }

type Listener = () => void

let state: ViewState = { kind: 'hidden' }
const listeners = new Set<Listener>()

/** 极简模块级 store：插件核心与主 UI 在同一 JS 上下文，直接共享 */
export const store = {
  get: (): ViewState => state,
  set(v: ViewState): void {
    state = v
    listeners.forEach((l) => l())
  },
  sub(l: Listener): () => void {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function closeUI(): void {
  store.set({ kind: 'hidden' })
  try {
    sdk.hideMainUI()
  } catch (e) {
    console.warn('[logseq-accounting] hideMainUI failed', e)
  }
}
