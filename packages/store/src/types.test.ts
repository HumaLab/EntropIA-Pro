import { describe, it, expect } from 'vitest'
import { createMockDbClient } from './__mocks__/db.mock'

describe('DbClient mock', () => {
  it('executes SQL and tracks it', async () => {
    const client = createMockDbClient()
    await client.execute('INSERT INTO test VALUES (1)')
    expect(client._executedSql).toContain('INSERT INTO test VALUES (1)')
  })

  it('selects rows from pre-populated table', async () => {
    const client = createMockDbClient({
      items: [{ id: '1', title: 'Test Item' }],
    })
    const rows = await client.select('SELECT * FROM items')
    expect(rows).toHaveLength(1)
  })
})
