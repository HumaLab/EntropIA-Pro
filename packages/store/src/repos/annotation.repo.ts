import { and, desc, eq } from 'drizzle-orm'
import { annotations } from '../schema'
import type { DrizzleClient } from '../types'

export type Annotation = typeof annotations.$inferSelect
export type NewAnnotation = typeof annotations.$inferInsert
export type AnnotationKind = Annotation['kind']
export type AnnotationInput = Omit<
  NewAnnotation,
  'id' | 'assetId' | 'page' | 'createdAt' | 'updatedAt'
>

export class AnnotationRepo {
  constructor(private db: DrizzleClient) {}

  async create(data: Omit<NewAnnotation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Annotation> {
    const now = Date.now()
    const rows = await this.db
      .insert(annotations)
      .values({
        id: crypto.randomUUID(),
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return rows[0]!
  }

  async findByAsset(assetId: string, page?: number): Promise<Annotation[]> {
    const scope =
      page === undefined
        ? eq(annotations.assetId, assetId)
        : and(eq(annotations.assetId, assetId), eq(annotations.page, page))

    return this.db
      .select()
      .from(annotations)
      .where(scope)
      .orderBy(desc(annotations.updatedAt), desc(annotations.createdAt))
  }

  async replaceForAssetPage(
    assetId: string,
    page: number,
    nextAnnotations: AnnotationInput[]
  ): Promise<Annotation[]> {
    await this.db
      .delete(annotations)
      .where(and(eq(annotations.assetId, assetId), eq(annotations.page, page)))

    if (nextAnnotations.length === 0) {
      return []
    }

    const now = Date.now()
    return this.db
      .insert(annotations)
      .values(
        nextAnnotations.map((annotation) => ({
          id: crypto.randomUUID(),
          assetId,
          page,
          ...annotation,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .returning()
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(annotations).where(eq(annotations.id, id))
  }
}
