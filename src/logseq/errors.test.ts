import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('shows useful fields from non-Error Logseq rejections', () => {
    expect(errorMessage({ message: 'invalid query input' })).toBe('invalid query input')
    expect(errorMessage({ data: { phase: 'query', code: 7 } })).toBe('{"phase":"query","code":7}')
  })
})
