import { sdk } from './sdk'
import { PROP, TXN_TAG, TYPE_EXPENSE, TYPE_INCOME } from './schema'
import { appendAfterJournalTimestamp, formatInlineTxnTitle, stripInlineSummary } from './presentation'

export type TxnMode = 'expense' | 'income'

export type SubmitStage =
  | 'load-source'
  | 'write-title'
  | 'insert-block'
  | 'fix-position'
  | 'add-tag'
  | 'write-amount'
  | 'write-type'
  | 'write-category'
  | 'write-account'

export interface SubmitWarning {
  stage: 'fix-position' | 'add-tag'
  cause: unknown
}

export interface SubmitResult {
  blockUuid: string
  warnings: SubmitWarning[]
}

export class TxnWriteError extends Error {
  readonly cause?: unknown

  constructor(
    message: string,
    readonly stage: SubmitStage,
    readonly blockUuid: string | undefined,
    readonly completed: SubmitStage[],
    options?: { cause?: unknown },
    readonly markedIncomplete = false,
  ) {
    super(message)
    this.name = 'TxnWriteError'
    if (options && 'cause' in options) this.cause = options.cause
  }
}

export interface TxnInput {
  mode: TxnMode
  amount: number
  category: string
  note: string
  currency: string
  decimalPlaces?: number
}

function txnTitle(input: TxnInput): string {
  const emoji = input.mode === 'expense' ? '💸' : '💰'
  const typeText = input.mode === 'expense' ? TYPE_EXPENSE : TYPE_INCOME
  const base = input.note ? `${emoji} ${input.note}` : `${emoji} ${input.category || typeText}`
  return formatInlineTxnTitle(base, input.amount, typeText, input.currency, '', '', input.decimalPlaces)
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
export async function submitTxn(blockUuid: string, input: TxnInput): Promise<SubmitResult> {
  const typeText = input.mode === 'expense' ? TYPE_EXPENSE : TYPE_INCOME
  const title = txnTitle(input)

  let uuid: string | undefined
  const completed: SubmitStage[] = []
  const warnings: SubmitWarning[] = []
  let blk
  try {
    blk = await sdk.Editor.getBlock(blockUuid)
    completed.push('load-source')
  } catch (cause) {
    throw new TxnWriteError('无法读取当前块', 'load-source', undefined, completed, { cause })
  }
  const content = String(blk?.content ?? blk?.title ?? '').trim()
  const timestampedTitle = appendAfterJournalTimestamp(content, title)

  if (blk && (!content || timestampedTitle)) {
    try {
      await sdk.Editor.updateBlock(blockUuid, timestampedTitle ?? title)
      uuid = blockUuid
      completed.push('write-title')
    } catch (cause) {
      throw new TxnWriteError('无法写入账单标题', 'write-title', blockUuid, completed, { cause })
    }
  } else {
    try {
      const nb = await sdk.Editor.insertBlock(blockUuid, title, { sibling: true })
      if (!nb?.uuid) throw new Error('Logseq insertBlock 未返回新块 UUID')
      uuid = nb.uuid
      completed.push('insert-block')
    } catch (cause) {
      throw new TxnWriteError('无法创建账单块', 'insert-block', undefined, completed, { cause })
    }

    let nbFull = null
    try {
      nbFull = await sdk.Editor.getBlock(uuid)
    } catch (cause) {
      warnings.push({ stage: 'fix-position', cause })
    }
    const parentUuid = await entityUuid(nbFull?.parent)
    if (!nbFull) {
      warnings.push({ stage: 'fix-position', cause: new Error('无法读取新账单块以确认层级') })
    } else if (nbFull.parent != null && !parentUuid) {
      warnings.push({ stage: 'fix-position', cause: new Error('无法解析新账单块的父级') })
    }
    if (parentUuid && parentUuid === String(blockUuid)) {
      // 变成了当前块的子块（下一级）→ 挪到当前块之后，保持同级
      try {
        await sdk.Editor.moveBlock(uuid, blockUuid, { before: false })
        completed.push('fix-position')
      } catch (cause) {
        warnings.push({ stage: 'fix-position', cause })
      }
    }
  }

  if (!uuid) {
    throw new TxnWriteError('未能确定账单块', 'insert-block', undefined, completed)
  }

  try {
    let tag = await sdk.Editor.getTag(TXN_TAG)
    if (!tag) tag = await sdk.Editor.createTag(TXN_TAG)
    if (!tag?.uuid) throw new Error('未能获取账单标签 UUID')
    await sdk.Editor.addBlockTag(uuid, tag.uuid)
    completed.push('add-tag')
  } catch (cause) {
    warnings.push({ stage: 'add-tag', cause })
  }

  const failures: Array<{ stage: SubmitStage; cause: unknown }> = []
  const required = async (stage: SubmitStage, work: () => Promise<unknown>) => {
    try {
      await work()
      completed.push(stage)
    } catch (cause) {
      failures.push({ stage, cause })
    }
  }

  await required('write-amount', () => sdk.Editor.upsertBlockProperty(uuid, PROP.amount, input.amount))
  await required('write-type', () => sdk.Editor.upsertBlockProperty(uuid, PROP.type, typeText))
  if (input.category) await required('write-category', () => upsertNodeProp(uuid, PROP.category, input.category))

  if (failures.length) {
    const markedTitle = `⚠️ 未完整保存 · ${title}`
    let markedIncomplete = false
    try {
      await sdk.Editor.updateBlock(uuid, markedTitle)
      markedIncomplete = true
    } catch (cause) {
      console.warn('[logseq-accounting] failed to mark incomplete transaction', { uuid, cause })
    }
    const first = failures[0]
    throw new TxnWriteError(
      `账单字段写入失败：${failures.map((failure) => failure.stage).join(', ')}`,
      first.stage,
      uuid,
      [...completed],
      { cause: first.cause },
      markedIncomplete,
    )
  }

  return { blockUuid: uuid, warnings }
}

/** 编辑已有账单：始终更新原块，不创建新块；清空分类/账户时同步删除对应属性。 */
export async function updateTxn(blockUuid: string, input: TxnInput): Promise<SubmitResult> {
  const typeText = input.mode === 'expense' ? TYPE_EXPENSE : TYPE_INCOME
  const completed: SubmitStage[] = []
  const failures: Array<{ stage: SubmitStage; cause: unknown }> = []
  const required = async (stage: SubmitStage, work: () => Promise<unknown>) => {
    try {
      await work()
      completed.push(stage)
    } catch (cause) {
      failures.push({ stage, cause })
    }
  }

  await required('write-title', () => sdk.Editor.updateBlock(blockUuid, txnTitle(input)))
  await required('write-amount', () => sdk.Editor.upsertBlockProperty(blockUuid, PROP.amount, input.amount))
  await required('write-type', () => sdk.Editor.upsertBlockProperty(blockUuid, PROP.type, typeText))
  await required('write-category', () =>
    input.category
      ? upsertNodeProp(blockUuid, PROP.category, input.category)
      : sdk.Editor.removeBlockProperty(blockUuid, PROP.category),
  )

  if (failures.length) {
    const first = failures[0]
    throw new TxnWriteError(
      `账单修改失败：${failures.map((failure) => failure.stage).join(', ')}`,
      first.stage,
      blockUuid,
      completed,
      { cause: first.cause },
    )
  }
  return { blockUuid, warnings: [] }
}

export function noteFromTxnTitle(title: string): string {
  return stripInlineSummary(title).replace(/^[💸💰]\s*/u, '')
}
