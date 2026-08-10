import { sdk } from './sdk'
import { queryAllTxns } from './query'
import { stripInlineSummary } from './presentation'

let syncing = false

export interface TitleSyncResult {
  total: number
  updated: number
  skipped: boolean
}

export async function restoreTxnTitles(): Promise<TitleSyncResult> {
  if (syncing) return { total: 0, updated: 0, skipped: true }
  syncing = true
  try {
    const txns = await queryAllTxns()
    let updated = 0
    await Promise.all(
      txns.map(async (txn) => {
        const expected = stripInlineSummary(txn.rawTitle)
        if (txn.rawTitle !== expected) {
          await sdk.Editor.updateBlock(txn.uuid, expected)
          updated += 1
        }
      }),
    )
    return { total: txns.length, updated, skipped: false }
  } finally {
    syncing = false
  }
}
