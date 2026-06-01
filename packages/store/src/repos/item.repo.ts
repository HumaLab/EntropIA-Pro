import { eq, and, like, or, desc } from 'drizzle-orm'
import type { DrizzleClient, DbClient } from '../types'
import { items } from '../schema'
import { FtsRepo, type FtsResult } from './fts.repo'

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert

export class ItemRepo {
  private ftsRepo: FtsRepo | null
  private rawClient?: DbClient

  constructor(
    private db: DrizzleClient,
    rawClient?: DbClient
  ) {
    this.rawClient = rawClient
    this.ftsRepo = rawClient ? new FtsRepo(rawClient) : null
  }

  async create(data: Omit<NewItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<Item> {
    const now = Date.now()
    const createdItem: Item = {
      id: crypto.randomUUID(),
      title: data.title,
      collectionId: data.collectionId,
      metadata: data.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    }

    if (this.rawClient) {
      // Validate that the parent collection exists before inserting (FK constraint)
      const collectionExists = await this.rawClient.select(
        'SELECT id FROM collections WHERE id = ?',
        [createdItem.collectionId]
      )
      if (collectionExists.length === 0) {
        throw new Error(
          `Cannot create item: collection "${createdItem.collectionId}" does not exist`
        )
      }

      await this.rawClient.execute(
        'INSERT INTO items (id, title, collection_id, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          createdItem.id,
          createdItem.title,
          createdItem.collectionId,
          createdItem.metadata,
          createdItem.createdAt,
          createdItem.updatedAt,
        ]
      )
    } else {
      await this.db.insert(items).values(createdItem)
    }

    return createdItem
  }

  async findByCollection(collectionId: string): Promise<Item[]> {
    return this.db
      .select()
      .from(items)
      .where(eq(items.collectionId, collectionId))
      .orderBy(desc(items.updatedAt))
  }

  async findById(id: string): Promise<Item | null> {
    const rows = await this.db.select().from(items).where(eq(items.id, id))

    return rows[0] ?? null
  }

  async update(id: string, data: Partial<Pick<NewItem, 'title' | 'metadata'>>): Promise<Item> {
    const rows = await this.db
      .update(items)
      .set({ ...data, updatedAt: Date.now() })
      .where(eq(items.id, id))
      .returning()

    return rows[0]!
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(items).where(eq(items.id, id))
  }

  /**
   * Delete an item and ALL its associated data in a single atomic transaction.
   * This is used when the last asset of an item is removed — the item becomes
   * an orphan and should be fully cleaned up.
   *
   * Cleanup order (dependencies first):
   * 1. Extractions (FK → assets)
   * 2. Assets (FK → items)
   * 3. Entities (FK → items)
   * 4. Triples (FK → items)
   * 5. Asset embeddings (item_id in vec_assets)
   * 6. FTS rebuild from canonical rowid sources
   * 7. Notes (FK → items)
   * 8. Item itself
   *
   * @throws Error if rawClient is not available
   * @throws Error if the transaction fails
   */
  async deleteWithCascade(id: string): Promise<void> {
    if (!this.rawClient) {
      throw new Error('deleteWithCascade requires a rawClient for transactional execution')
    }

    const esc = id.replace(/'/g, "''")

    // Get the parent collection ID before deleting the item (needed for auto-cleanup)
    const parentRows = await this.rawClient.select(
      `SELECT collection_id FROM items WHERE id = '${esc}'`,
      []
    )
    const collectionId = parentRows[0]?.collection_id as string | undefined
    const escCollectionId = collectionId !== undefined ? collectionId.replace(/'/g, "''") : ''

    // Phase 1: Atomic transaction for core tables (always exist)
    try {
      await this.rawClient.executeBatch(`
        BEGIN;
        DELETE FROM extractions WHERE asset_id IN (SELECT id FROM assets WHERE item_id = '${esc}');
        DELETE FROM layouts WHERE asset_id IN (SELECT id FROM assets WHERE item_id = '${esc}');
        DELETE FROM llm_results WHERE (target_type = 'asset' OR target_type = 'unknown') AND target_id IN (SELECT id FROM assets WHERE item_id = '${esc}');
        DELETE FROM llm_results WHERE target_id = '${esc}' AND (target_type = 'item' OR target_type = 'unknown');
        DELETE FROM assets WHERE item_id = '${esc}';
        DELETE FROM entities WHERE item_id = '${esc}';
        DELETE FROM triples WHERE item_id = '${esc}';
        DELETE FROM notes WHERE item_id = '${esc}';
        DELETE FROM items WHERE id = '${esc}';
        DELETE FROM collections WHERE id = '${escCollectionId}' AND id NOT IN (SELECT DISTINCT collection_id FROM items);
        COMMIT;
      `)
    } catch (e) {
      throw new Error(
        `Failed to delete item cascade for ${id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    // Phase 2: Best-effort cleanup for optional tables / derived indexes
    try {
      await this.ftsRepo?.rebuildIndex()
    } catch {
      /* table may not exist — non-fatal */
    }

    try {
      await this.rawClient.execute(`DELETE FROM vec_assets WHERE item_id = '${esc}'`)
    } catch {
      /* table may not exist — non-fatal */
    }
  }

  /**
   * Search items by text.
   * - If a rawClient was provided (FTS5 available), tries FTS5 first.
   *   If FTS5 returns results, fetches those items from Drizzle and returns them.
   * - Falls back to SQL LIKE on title and metadata if FTS5 is unavailable or returns nothing.
   */
  async searchByText(collectionId: string, query: string): Promise<Item[]> {
    // Try FTS5 first if rawClient is available
    if (this.ftsRepo && query.trim()) {
      const ftsResults = await this.ftsRepo.search(query, 50)
      if (ftsResults.length > 0) {
        // Fetch the actual items from Drizzle using the IDs returned by FTS5
        const ids = ftsResults.map((r) => r.itemId)
        const rows = await this.db
          .select()
          .from(items)
          .where(
            and(
              eq(items.collectionId, collectionId),
              // Filter to items whose IDs are in the FTS5 result set
              // We use an OR chain over all matched IDs
              ids.length === 1 ? eq(items.id, ids[0]!) : or(...ids.map((id) => eq(items.id, id)))!
            )
          )
          .orderBy(desc(items.updatedAt))

        return rows
      }
    }

    // Fallback: SQL LIKE on title and metadata
    const pattern = `%${query}%`
    return this.db
      .select()
      .from(items)
      .where(
        and(
          eq(items.collectionId, collectionId),
          or(like(items.title, pattern), like(items.metadata, pattern))
        )
      )
      .orderBy(desc(items.updatedAt))
  }

  /**
   * FTS5-based search. Returns FtsResult[] with itemId and rank.
   * Requires a rawClient (DbClient) to be provided at construction time.
   * Returns empty array if no rawClient or empty query.
   */
  async searchByFts5(query: string, _collectionId?: string): Promise<FtsResult[]> {
    if (!this.ftsRepo || !query.trim()) return []
    return this.ftsRepo.search(query, 50)
  }

  /**
   * Search items across ALL collections.
   * Tries FTS5 first, falls back to SQL LIKE on title and metadata.
   */
  async searchGlobal(query: string, limit = 20): Promise<Item[]> {
    if (!query.trim()) return []

    // Try FTS5 first
    if (this.ftsRepo) {
      const ftsResults = await this.ftsRepo.search(query, limit)
      if (ftsResults.length > 0) {
        const ids = ftsResults.map((r) => r.itemId)
        return this.db
          .select()
          .from(items)
          .where(
            ids.length === 1 ? eq(items.id, ids[0]!) : or(...ids.map((id) => eq(items.id, id)))!
          )
          .orderBy(desc(items.updatedAt))
      }
    }

    // Fallback: SQL LIKE on title and metadata
    const pattern = `%${query}%`
    return this.db
      .select()
      .from(items)
      .where(or(like(items.title, pattern), like(items.metadata, pattern)))
      .orderBy(desc(items.updatedAt))
      .limit(limit)
  }
}
