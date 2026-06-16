import { describe, expect, it } from 'vitest'
import { LatestRequestGuard } from './item-view-load-guards'

describe('LatestRequestGuard', () => {
  it('marks only the latest request token as current', () => {
    const guard = new LatestRequestGuard()

    const first = guard.next()
    const second = guard.next()

    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
  })

  it('invalidates an in-flight token without starting a request', () => {
    const guard = new LatestRequestGuard()
    const token = guard.next()

    guard.invalidate()

    expect(guard.isCurrent(token)).toBe(false)
  })
})
