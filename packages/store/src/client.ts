import { invoke } from '@tauri-apps/api/core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { DbClient } from './types'

/**
 * Creates a low-level database client that bridges TypeScript ↔ Rust via Tauri IPC.
 * Every SQL call is forwarded to the Rust backend through `invoke`.
 */
export const createDbClient = (): DbClient => ({
  async execute(sql, params = []) {
    console.log('[db] execute:', sql.slice(0, 50), '...')
    const result = await invoke<{ rowsAffected: number }>('db_execute', { sql, params })
    console.log('[db] execute done, rowsAffected:', result.rowsAffected)
    return result
  },
  async executeBatch(sql: string) {
    console.log('[db] executeBatch:', sql.slice(0, 100), '...')
    await invoke('db_execute_batch', { sql })
    console.log('[db] executeBatch done')
  },
  async select<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    console.log('[db] select:', sql.slice(0, 50), '...')
    const result = await invoke<T[]>('db_select', { sql, params })
    console.log('[db] select done, rows:', result.length)
    return result
  },
})

/**
 * Creates a Drizzle ORM instance in sqlite-proxy mode.
 * Delegates all SQL execution to the provided DbClient (Tauri IPC).
 *
 * - `run` method: used for INSERT/UPDATE/DELETE without row results — executes via client.execute
 * - `all`/`get`/`values` methods: used for row-returning queries (SELECT and DML with RETURNING)
 *   — executes via db_select_rows, which returns rows as arrays in correct column order
 *   (Drizzle expects `{ rows: unknown[][] }`)
 */
export const createDrizzleClient = (client: DbClient) =>
  drizzle(async (sql, params, method) => {
    if (method === 'run') {
      await client.execute(sql, params as unknown[])
      return { rows: [] }
    }
    // Use db_select_rows for any query that returns rows (including DML with RETURNING)
    const rows = await invoke<unknown[][]>('db_select_rows', { sql, params })
    return { rows }
  })
