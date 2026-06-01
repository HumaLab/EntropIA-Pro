import { eq, and, or, isNull } from 'drizzle-orm'
import type { DrizzleClient } from '../types'
import { triples } from '../schema'

export type Triple = typeof triples.$inferSelect

export type NewTriple = {
  subject: string
  predicate: string
  object: string
  assetId?: string | null
}

export class TripleRepo {
  constructor(private db: DrizzleClient) {}

  async findByItemId(itemId: string): Promise<Triple[]> {
    return this.db.select().from(triples).where(eq(triples.itemId, itemId))
  }

  /** Find triples scoped to a specific asset, plus item-level triples (assetId = null). */
  async findByAssetId(itemId: string, assetId: string): Promise<Triple[]> {
    return this.db
      .select()
      .from(triples)
      .where(
        and(
          eq(triples.itemId, itemId),
          or(eq(triples.assetId, assetId), isNull(triples.assetId))
        )
      )
  }

  async replaceByItemId(itemId: string, rows: NewTriple[]): Promise<void> {
    await this.db.delete(triples).where(eq(triples.itemId, itemId))
    if (rows.length === 0) return

    await this.db.insert(triples).values(
      rows.map((row) => ({
        id: crypto.randomUUID(),
        itemId,
        assetId: row.assetId ?? null,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        createdAt: Date.now(),
      }))
    )
  }
}
