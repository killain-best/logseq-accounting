import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMock = vi.hoisted(() => ({
  Editor: {
    getBlock: vi.fn(),
    updateBlock: vi.fn(),
    insertBlock: vi.fn(),
    moveBlock: vi.fn(),
    getTag: vi.fn(),
    createTag: vi.fn(),
    addBlockTag: vi.fn(),
    upsertBlockProperty: vi.fn(),
    removeBlockProperty: vi.fn(),
  },
}))

vi.mock('./sdk', () => ({ sdk: sdkMock }))

import { submitTxn, updateTxn, TxnWriteError } from './commands'
import { PROP } from './schema'

const input = {
  mode: 'expense' as const,
  amount: 35,
  category: '餐饮',
  note: '午餐',
  currency: '¥',
}

describe('submitTxn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdkMock.Editor.getTag.mockResolvedValue({ uuid: 'tag-id' })
    sdkMock.Editor.updateBlock.mockResolvedValue(undefined)
    sdkMock.Editor.moveBlock.mockResolvedValue(undefined)
    sdkMock.Editor.addBlockTag.mockResolvedValue(undefined)
    sdkMock.Editor.upsertBlockProperty.mockResolvedValue(undefined)
    sdkMock.Editor.removeBlockProperty.mockResolvedValue(undefined)
  })

  it('writes an empty source block in place', async () => {
    sdkMock.Editor.getBlock.mockResolvedValue({ uuid: 'source', content: '' })

    const result = await submitTxn('source', input)

    expect(result.blockUuid).toBe('source')
    expect(sdkMock.Editor.updateBlock).toHaveBeenCalledWith('source', '💸 午餐　−¥35')
    expect(sdkMock.Editor.upsertBlockProperty).toHaveBeenCalledWith('source', PROP.amount, 35)
  })

  it('never writes properties to the source when insertion returns no uuid', async () => {
    sdkMock.Editor.getBlock.mockResolvedValue({ uuid: 'source', content: 'existing' })
    sdkMock.Editor.insertBlock.mockResolvedValue(null)

    await expect(submitTxn('source', input)).rejects.toMatchObject({
      name: 'TxnWriteError',
      stage: 'insert-block',
      blockUuid: undefined,
    })
    expect(sdkMock.Editor.upsertBlockProperty).not.toHaveBeenCalled()
  })

  it('reports the retained target block and failed stage', async () => {
    sdkMock.Editor.getBlock
      .mockResolvedValueOnce({ uuid: 'source', content: 'existing' })
      .mockResolvedValueOnce({ uuid: 'new', parent: null })
    sdkMock.Editor.insertBlock.mockResolvedValue({ uuid: 'new' })
    sdkMock.Editor.upsertBlockProperty.mockRejectedValueOnce(new Error('host failed'))

    await expect(submitTxn('source', input)).rejects.toMatchObject({
      name: 'TxnWriteError',
      stage: 'write-amount',
      blockUuid: 'new',
    })
    expect(sdkMock.Editor.updateBlock).toHaveBeenCalledWith(
      'new',
      '⚠️ 未完整保存 · 💸 午餐　−¥35',
    )
    expect(sdkMock.Editor.upsertBlockProperty).toHaveBeenCalledWith('new', PROP.category, '餐饮')
    expect(sdkMock.Editor.upsertBlockProperty).not.toHaveBeenCalledWith('new', PROP.account, expect.anything())
  })

  it('keeps writing core properties when adding the tag fails', async () => {
    sdkMock.Editor.getBlock.mockResolvedValue({ uuid: 'source', content: '' })
    sdkMock.Editor.addBlockTag.mockRejectedValue(new Error('tag failed'))

    const result = await submitTxn('source', input)

    expect(result.warnings.map((warning) => warning.stage)).toContain('add-tag')
    expect(sdkMock.Editor.upsertBlockProperty).toHaveBeenCalledWith('source', PROP.amount, 35)
  })

  it('warns when the tag API returns no tag uuid', async () => {
    sdkMock.Editor.getBlock.mockResolvedValue({ uuid: 'source', content: '' })
    sdkMock.Editor.getTag.mockResolvedValue(null)
    sdkMock.Editor.createTag.mockResolvedValue(null)

    const result = await submitTxn('source', input)

    expect(result.warnings.map((warning) => warning.stage)).toContain('add-tag')
  })

  it('warns when the inserted block hierarchy cannot be verified', async () => {
    sdkMock.Editor.getBlock
      .mockResolvedValueOnce({ uuid: 'source', content: 'existing' })
      .mockResolvedValueOnce(null)
    sdkMock.Editor.insertBlock.mockResolvedValue({ uuid: 'new' })

    const result = await submitTxn('source', input)

    expect(result.warnings.map((warning) => warning.stage)).toContain('fix-position')
  })

  it('falls back to the array form for node properties', async () => {
    sdkMock.Editor.getBlock.mockResolvedValue({ uuid: 'source', content: '' })
    sdkMock.Editor.upsertBlockProperty.mockImplementation(async (_uuid, key, value) => {
      if (key === PROP.category && typeof value === 'string') throw new Error('array required')
    })

    await submitTxn('source', input)

    expect(sdkMock.Editor.upsertBlockProperty).toHaveBeenCalledWith('source', PROP.category, ['餐饮'])
  })

  it('exposes a concrete error class for the form boundary', () => {
    expect(new TxnWriteError('failed', 'write-type', 'uuid', [])).toBeInstanceOf(Error)
  })
})

describe('updateTxn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdkMock.Editor.updateBlock.mockResolvedValue(undefined)
    sdkMock.Editor.upsertBlockProperty.mockResolvedValue(undefined)
    sdkMock.Editor.removeBlockProperty.mockResolvedValue(undefined)
  })

  it('updates the existing block without inserting another transaction', async () => {
    await updateTxn('existing', { ...input, amount: 42 })

    expect(sdkMock.Editor.insertBlock).not.toHaveBeenCalled()
    expect(sdkMock.Editor.updateBlock).toHaveBeenCalledWith('existing', '💸 午餐　−¥42')
    expect(sdkMock.Editor.upsertBlockProperty).toHaveBeenCalledWith('existing', PROP.amount, 42)
  })

  it('removes the category property when it is cleared', async () => {
    await updateTxn('existing', { ...input, category: '' })

    expect(sdkMock.Editor.removeBlockProperty).toHaveBeenCalledWith('existing', PROP.category)
  })
})
