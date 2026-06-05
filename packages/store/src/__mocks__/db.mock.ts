import type { DbClient } from '../types'

interface MockRow {
  [key: string]: unknown
}

export function createMockDbClient(initialData: Record<string, MockRow[]> = {}): DbClient & {
  _data: Record<string, MockRow[]>
  _executedSql: string[]
} {
  const data: Record<string, MockRow[]> = { ...initialData }
  const executedSql: string[] = []

  return {
    _data: data,
    _executedSql: executedSql,

    async execute(sql: string, _params?: unknown[]) {
      executedSql.push(sql)
      return { rowsAffected: 1 }
    },

    async select<T>(sql: string, _params?: unknown[]): Promise<T[]> {
      executedSql.push(sql)
      // Simple table name extraction for basic mock queries
      const match = sql.match(/FROM\s+"?(\w+)"?/i)
      if (match) {
        const table = match[1] ?? ''
        return (data[table] ?? []) as T[]
      }
      return []
    },

    async selectRows(sql: string, params?: unknown[]): Promise<unknown[][]> {
      const rows = await this.select<Record<string, unknown>>(sql, params)
      return rows.map((row) => Object.values(row))
    },

    async executeBatch(sql: string): Promise<void> {
      executedSql.push(sql)
    },
  }
}
