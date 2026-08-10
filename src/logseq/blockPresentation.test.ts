import { describe, expect, it } from 'vitest'
import { clickedTransactionUuid } from './blockPresentation'

function eventFor(target: unknown, overrides: Partial<MouseEvent> = {}) {
  return {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target,
    ...overrides,
  } as MouseEvent
}

describe('clickedTransactionUuid', () => {
  it('accepts a closest-capable element from another window realm', () => {
    const block = { getAttribute: () => 'txn-uuid' }
    const target = {
      closest(selector: string) {
        if (selector.includes('a,button')) return null
        return block
      },
    }
    expect(clickedTransactionUuid(eventFor(target))).toBe('txn-uuid')
  })

  it('preserves links and modifier clicks', () => {
    const target = { closest: () => ({ getAttribute: () => 'txn-uuid' }) }
    expect(clickedTransactionUuid(eventFor(target, { ctrlKey: true }))).toBeNull()
  })

  it('does not reject a normal Logseq block merely because its title is contenteditable', () => {
    const block = { getAttribute: () => 'txn-uuid' }
    const target = {
      closest(selector: string) {
        if (selector.includes('.bullet-container')) return null
        return block
      },
    }
    expect(clickedTransactionUuid(eventFor(target))).toBe('txn-uuid')
  })
})
