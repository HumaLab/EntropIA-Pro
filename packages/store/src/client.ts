import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { DbClient } from './types'

/**
 * Creates a Drizzle ORM instance in sqlite-proxy mode.
 * Delegates all SQL execution to the provided DbClient port.
 *
 * - `run` method: used for INSERT/UPDATE/DELETE without row results — executes via client.execute
 * - `all`/`get`/`values` methods: used for row-returning queries (SELECT and DML with RETURNING)
 *   — executes via client.selectRows, which returns rows as arrays in correct column order
 *   (Drizzle expects `{ rows: unknown[][] }`)
 */
export const createDrizzleClient = (client: DbClient) =>
  drizzle(async (sql, params, method) => {
    if (method === 'run') {
      await client.execute(sql, params as unknown[])
      return { rows: [] }
    }
    // Use db_select_rows for any query that returns rows (including DML with RETURNING)
    const rows = await client.selectRows(sql, params as unknown[])
    return { rows }
  })
