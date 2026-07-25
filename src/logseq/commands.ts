import { sdk } from './sdk'
import { PROP, TXN_TAG, TYPE_EXPENSE, TYPE_INCOME } from './schema'

export type TxnMode = 'expense' | 'income'

export interface TxnInput {
  mode: TxnMode
  amount: number
  category: string
  account: string
  note: string
}

/** node 型属性：cardinality 'one' 传字符串；个别版本要求数组，失败时兜底 */
async function upsertNodeProp(uuid: string, key: string, value: string): Promise<void> {
  try {
    await sdk.Editor.upsertBlockProperty(uuid, key, value)
  } catch {
    await sdk.Editor.upsertBlockProperty(uuid, key, [value])
  }
}

/** 从 BlockEntity.parent 的各种可能形态里解析出父级 uuid */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function entityUuid(ref: any): Promise<string | null> {
  if (ref == null) return null
  if (typeof ref === 'string') return ref
  if (typeof ref === 'number') {
    const b = await sdk.Editor.getBlock(ref).catch(() => null)
    return b?.uuid ? String(b.uuid) : null
  }
  if (typeof ref === 'object') {
    if (ref.uuid) return String(ref.uuid)
    if (typeof ref.id === 'number') {
      const b = await sdk.Editor.getBlock(ref.id).catch(() => null)
      return b?.uuid ? String(b.uuid) : null
    }
  }
  return null
}

/**
 * 把一笔账写入日志（保持本级）：
 * 1. 当前块为空 → 就地写入该块；
 * 2. 当前块非空 → 在其下方插入【同级】块。
 *    SDK 的 sibling:true 在部分 DB 版宿主上可能被忽略（变成子块），
 *    插入后校验父级，若成了当前块的子块则挪回同级。
 * 最后挂上 #账单 tag 和 4 个 DB 属性。
 */
export async function submitTxn(blockUuid: string, input: TxnInput): Promise<void> {
  const emoji = input.mode === 'expense' ? '💸' : '💰'
  const typeText = input.mode === 'expense' ? TYPE_EXPENSE : TYPE_INCOME
  const title = input.note ? `${emoji} ${input.note}` : `${emoji} ${input.category || typeText}`

  let uuid = blockUuid
  const blk = await sdk.Editor.getBlock(blockUuid).catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = String((blk as any)?.content ?? (blk as any)?.title ?? '').trim()

  if (blk && !content) {
    await sdk.Editor.updateBlock(blockUuid, title)
  } else {
    const nb = await sdk.Editor.insertBlock(blockUuid, title, { sibling: true })
    if (nb?.uuid) {
      uuid = nb.uuid
      const nbFull = await sdk.Editor.getBlock(uuid).catch(() => null)
      const parentUuid = await entityUuid(nbFull?.parent)
      if (parentUuid && parentUuid === String(blockUuid)) {
        // 变成了当前块的子块（下一级）→ 挪到当前块之后，保持同级
        await sdk.Editor.moveBlock(uuid, blockUuid, { before: false }).catch((e: unknown) => {
          console.warn('[logseq-accounting] moveBlock failed', e)
        })
      }
    }
  }

  try {
    let tag = await sdk.Editor.getTag(TXN_TAG)
    if (!tag) tag = await sdk.Editor.createTag(TXN_TAG)
    if (tag?.uuid) await sdk.Editor.addBlockTag(uuid, tag.uuid)
  } catch (e) {
    console.warn('[logseq-accounting] addBlockTag failed', e)
  }

  await sdk.Editor.upsertBlockProperty(uuid, PROP.amount, input.amount)
  await sdk.Editor.upsertBlockProperty(uuid, PROP.type, typeText)
  if (input.category) await upsertNodeProp(uuid, PROP.category, input.category)
  if (input.account) await upsertNodeProp(uuid, PROP.account, input.account)
}
