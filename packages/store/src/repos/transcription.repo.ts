import { eq, desc } from 'drizzle-orm'
import type { DrizzleClient } from '../types'
import { transcriptions } from '../schema'

export type Transcription = typeof transcriptions.$inferSelect
export type NewTranscription = typeof transcriptions.$inferInsert

/**
 * Typed segment from Whisper transcription.
 * Stored as JSON in the `segments` column.
 */
export interface TranscriptionSegment {
  start_ms: number
  end_ms: number
  text: string
}

export class TranscriptionRepo {
  constructor(private db: DrizzleClient) {}

  /**
   * Upsert transcription for an asset — deletes any existing transcription
   * for the assetId, then inserts a new one. Guarantees single row per asset.
   */
  async upsert(data: {
    assetId: string
    textContent: string
    model: string
    language?: string | null
    durationMs?: number | null
    segments?: TranscriptionSegment[] | null
    confidence?: number | null
  }): Promise<Transcription> {
    // Delete existing transcription for this asset
    await this.db.delete(transcriptions).where(eq(transcriptions.assetId, data.assetId))

    // Insert new transcription
    const rows = await this.db
      .insert(transcriptions)
      .values({
        id: crypto.randomUUID(),
        assetId: data.assetId,
        textContent: data.textContent,
        model: data.model,
        language: data.language ?? null,
        durationMs: data.durationMs ?? null,
        segments: data.segments ? JSON.stringify(data.segments) : null,
        confidence: data.confidence ?? null,
        createdAt: Date.now(),
      })
      .returning()

    return rows[0]!
  }

  async findByAsset(assetId: string): Promise<Transcription | null> {
    const rows = await this.db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.assetId, assetId))
      .orderBy(desc(transcriptions.createdAt))
      .limit(1)

    return rows[0] ?? null
  }

  async findAllByAsset(assetId: string): Promise<Transcription[]> {
    return this.db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.assetId, assetId))
      .orderBy(desc(transcriptions.createdAt))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(transcriptions).where(eq(transcriptions.id, id))
  }

  /**
   * Update only the text_content of the latest transcription for an asset.
   * Preserves id, created_at, model, language, duration_ms, segments, and confidence.
   * Returns `Ok(())` even if no transcription exists (no-op).
   */
  async updateText(assetId: string, textContent: string): Promise<void> {
    const latest = await this.findByAsset(assetId)
    if (!latest) return
    await this.db
      .update(transcriptions)
      .set({ textContent })
      .where(eq(transcriptions.id, latest.id))
  }

  /**
   * Parse the segments JSON string into typed TranscriptionSegment[].
   */
  static parseSegments(segmentsJson: string | null): TranscriptionSegment[] {
    if (!segmentsJson) return []
    try {
      return JSON.parse(segmentsJson) as TranscriptionSegment[]
    } catch {
      return []
    }
  }
}
