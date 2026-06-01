/**
 * NLP frontend client for EntropIA desktop app.
 * Plain TypeScript (not .svelte.ts) for full testability in Vitest.
 *
 * Communicates with the Rust backend via Tauri invoke + event listeners.
 * Mirrors the OcrStore architecture.
 */

import { invoke } from '@tauri-apps/api/core'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NlpJobType = 'fts' | 'embed' | 'ner' | 'triples'
export type NlpStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

export interface ItemNlpState {
  fts: NlpStatus
  embed: NlpStatus
  ner: NlpStatus
  triples: NlpStatus
  errors?: {
    fts?: string
    embed?: string
    ner?: string
    triples?: string
  }
}

export interface FtsResult {
  itemId: string
  title: string
  rank: number
}

export interface SimilarAsset {
  assetId: string
  itemId: string
  title: string
  collectionId: string
  assetPath: string
  assetType: string
  similarity: number
}

export interface AssetEmbeddingBackfillFailure {
  assetId: string
  itemId: string
  error: string
}

export interface AssetEmbeddingBackfillReport {
  force: boolean
  limit?: number
  totalAssets: number
  assetsWithText: number
  assetsWithEmbedding: number
  assetsMissingEmbedding: number
  requested: number
  succeeded: number
  failed: number
  failures: AssetEmbeddingBackfillFailure[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload shapes emitted by the Rust backend
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressPayload {
  item_id: string
  job: string
  pct: number
}

interface CompletePayload {
  item_id: string
  job: string
}

interface ErrorPayload {
  item_id: string
  job: string
  error: string
}

// ─────────────────────────────────────────────────────────────────────────────
// NlpStore
// ─────────────────────────────────────────────────────────────────────────────

const IDLE_STATE: ItemNlpState = { fts: 'idle', embed: 'idle', ner: 'idle', triples: 'idle' }

export class NlpStore {
  private states = new Map<string, ItemNlpState>()
  private cleanupFns: Array<() => void> = []

  /** Returns the current NLP state for an item, or idle if unknown. */
  getState(itemId: string): ItemNlpState {
    return this.states.get(itemId) ?? { ...IDLE_STATE }
  }

  /**
   * Registers Tauri event listeners for nlp:progress, nlp:complete, nlp:error.
   * The `listen` function is injected (from @tauri-apps/api/event) for testability.
   */
  async startListening(
    listen: (event: string, callback: (e: { payload: unknown }) => void) => Promise<() => void>
  ): Promise<void> {
    const unlistenProgress = await listen('nlp:progress', (e) => {
      const p = e.payload as ProgressPayload
      this._setJobStatus(p.item_id, p.job as NlpJobType, 'running')
    })

    const unlistenComplete = await listen('nlp:complete', (e) => {
      const p = e.payload as CompletePayload
      this._setJobStatus(p.item_id, p.job as NlpJobType, 'done')
    })

    const unlistenError = await listen('nlp:error', (e) => {
      const p = e.payload as ErrorPayload
      this._setJobStatus(p.item_id, p.job as NlpJobType, 'error', p.error)
    })

    this.cleanupFns = [unlistenProgress, unlistenComplete, unlistenError]
  }

  /** Calls all cleanup functions returned by listen(), removing event listeners. */
  stopListening(): void {
    for (const fn of this.cleanupFns) {
      fn()
    }
    this.cleanupFns = []
  }

  /** Updates a single job's status in the state map for the given itemId. */
  _setJobStatus(itemId: string, job: NlpJobType, status: NlpStatus, error?: string): void {
    const current = this.states.get(itemId) ?? { ...IDLE_STATE }
    const updated: ItemNlpState = { ...current, [job]: status }
    if (error) {
      updated.errors = { ...current.errors, [job]: error }
    }
    this.states.set(itemId, updated)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoke wrappers
// ─────────────────────────────────────────────────────────────────────────────

/** Submit an FTS5 indexing job for `itemId`. */
export async function indexFts(itemId: string): Promise<void> {
  await invoke('index_fts', { itemId })
}

/** Submit an NER extraction job for `itemId`. */
export async function extractEntities(itemId: string): Promise<void> {
  await invoke('extract_entities', { itemId })
}

/** Submit the remaining item-level enrichment job (FTS + NER) for `itemId`. */
export async function enrichItem(itemId: string): Promise<void> {
  await invoke('enrich_item', { itemId })
}

// ── Asset-level NLP commands ─────────────────────────────────────────────────
// These process only the selected asset's text, not the entire item.
// Results are stored with both itemId (ownership) and assetId (filtering).

/** Submit an embedding computation job for a specific asset. */
export async function embedAsset(itemId: string, assetId: string): Promise<void> {
  await invoke('embed_asset', { itemId, assetId })
}

/** Batch backfill asset-level embeddings for assets that already have text. */
export async function backfillAssetEmbeddings(
  options: { force?: boolean; limit?: number } = {}
): Promise<AssetEmbeddingBackfillReport> {
  return await invoke('backfill_asset_embeddings', {
    force: options.force,
    limit: options.limit,
  })
}

/** Submit a NER extraction job for a specific asset. */
export async function extractEntitiesForAsset(itemId: string, assetId: string): Promise<void> {
  await invoke('extract_entities_for_asset', { itemId, assetId })
}

/** Submit a semantic triples extraction job for a specific asset. */
export async function extractTriplesForAsset(itemId: string, assetId: string): Promise<void> {
  await invoke('extract_triples_for_asset', { itemId, assetId })
}

/** Search items using FTS5. Returns results ordered by BM25 relevance. */
export async function ftsSearch(query: string, collectionId?: string): Promise<FtsResult[]> {
  return await invoke('fts_search', { query, collectionId })
}

/** Find assets similar to `assetId` via asset-level kNN vector search. */
export async function similarAssets(assetId: string, limit: number = 5): Promise<SimilarAsset[]> {
  return await invoke('similar_assets', { assetId, limit })
}
