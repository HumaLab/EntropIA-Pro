import { eq, asc } from 'drizzle-orm'
import type { DrizzleClient, DbClient } from '../types'
import { assets } from '../schema'

export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert

export class AssetRepo {
  constructor(
    private db: DrizzleClient,
    private rawClient?: DbClient
  ) {}

  async create(data: Omit<NewAsset, 'id' | 'createdAt'>): Promise<Asset> {
    const createdAsset: Asset = {
      id: crypto.randomUUID(),
      itemId: data.itemId,
      path: data.path,
      type: data.type,
      sortIndex: data.sortIndex ?? 0,
      size: data.size ?? null,
      createdAt: Date.now(),
    }

    if (this.rawClient) {
      // Validate that the parent item exists before inserting (FK constraint)
      const itemExists = await this.rawClient.select('SELECT id FROM items WHERE id = ?', [
        createdAsset.itemId,
      ])
      if (itemExists.length === 0) {
        throw new Error(`Cannot create asset: item "${createdAsset.itemId}" does not exist`)
      }

      await this.rawClient.execute(
        'INSERT INTO assets (id, item_id, path, type, sort_index, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          createdAsset.id,
          createdAsset.itemId,
          createdAsset.path,
          createdAsset.type,
          createdAsset.sortIndex,
          createdAsset.size,
          createdAsset.createdAt,
        ]
      )
    } else {
      await this.db.insert(assets).values(createdAsset)
    }

    return createdAsset
  }

  async findByItem(itemId: string): Promise<Asset[]> {
    return this.db.select().from(assets).where(eq(assets.itemId, itemId)).orderBy(asc(assets.sortIndex))
  }

  async findById(id: string): Promise<Asset | null> {
    const rows = await this.db.select().from(assets).where(eq(assets.id, id))

    return rows[0] ?? null
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(assets).where(eq(assets.id, id))
  }

  /**
   * Update the path of an asset (e.g. after JPEG → PNG conversion).
   */
  async updatePath(id: string, newPath: string): Promise<void> {
    if (this.rawClient) {
      await this.rawClient.execute('UPDATE assets SET path = ? WHERE id = ?', [
        newPath,
        id,
      ])
    } else {
      await this.db.update(assets).set({ path: newPath }).where(eq(assets.id, id))
    }
  }

  /**
   * Delete an asset and all its dependent records
   * in a single atomic transaction. Returns the deleted asset record
   * so the caller can remove the associated file from the filesystem.
   *
   * @throws Error if the asset is not found
   * @throws Error if the transaction fails (partial cleanup possible)
   */
  async deleteWithCascade(id: string): Promise<Asset> {
    if (!this.rawClient) {
      throw new Error('deleteWithCascade requires a rawClient for transactional execution')
    }

    // Step 1: Fetch the asset to get its path and verify it exists
    const asset = await this.findById(id)
    if (!asset) {
      throw new Error(`Asset not found: ${id}`)
    }

    // Step 2: Execute all deletes in a single transaction
    // Using a single SQL batch ensures atomicity (all or nothing)
    try {
      await this.rawClient.executeBatch(`
        DELETE FROM extractions WHERE asset_id = '${id.replace(/'/g, "''")}';
        DELETE FROM layouts WHERE asset_id = '${id.replace(/'/g, "''")}';
        DELETE FROM transcriptions WHERE asset_id = '${id.replace(/'/g, "''")}';
        DELETE FROM llm_results WHERE target_id = '${id.replace(/'/g, "''")}' AND (target_type = 'asset' OR target_type = 'unknown');
        DELETE FROM annotations WHERE asset_id = '${id.replace(/'/g, "''")}';
        DELETE FROM assets WHERE id = '${id.replace(/'/g, "''")}';
      `)
    } catch (e) {
      // Transaction failed — rethrow with context
      throw new Error(
        `Failed to delete asset cascade for ${id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    return asset
  }
}
