/**
 * Per-collection persistence for the text-analysis panel settings
 * (cloud term count and custom stopwords), stored in localStorage.
 */

export interface CollectionAnalysisSettings {
  cloudTermCount: number
  customStopwords: string[]
}

export const MIN_CLOUD_TERMS = 20
export const MAX_CLOUD_TERMS = 100
export const DEFAULT_CLOUD_TERMS = 50

const STORAGE_PREFIX = 'entropia-collection-analysis-settings:'

export function defaultAnalysisSettings(): CollectionAnalysisSettings {
  return { cloudTermCount: DEFAULT_CLOUD_TERMS, customStopwords: [] }
}

export function clampCloudTermCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CLOUD_TERMS
  return Math.max(MIN_CLOUD_TERMS, Math.min(MAX_CLOUD_TERMS, Math.round(value)))
}

/**
 * Parse free-form user input (comma / semicolon / whitespace separated)
 * into a normalized, deduplicated stopword list. Normalization matches
 * the tokenizer (NFC + lowercase) so entries always hit the lookup Set.
 */
export function parseStopwordsInput(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[\s,;]+/)) {
    const word = part.trim().normalize('NFC').toLowerCase()
    if (word) seen.add(word)
  }
  return [...seen]
}

function storageKey(collectionId: string): string {
  return `${STORAGE_PREFIX}${collectionId}`
}

export function loadAnalysisSettings(collectionId: string): CollectionAnalysisSettings {
  try {
    const raw = localStorage.getItem(storageKey(collectionId))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CollectionAnalysisSettings>
      return {
        cloudTermCount: clampCloudTermCount(Number(parsed.cloudTermCount)),
        customStopwords: Array.isArray(parsed.customStopwords)
          ? parseStopwordsInput(parsed.customStopwords.join(' '))
          : [],
      }
    }
  } catch {
    // corrupt entry or storage unavailable — fall back to defaults
  }
  return defaultAnalysisSettings()
}

export function saveAnalysisSettings(
  collectionId: string,
  settings: CollectionAnalysisSettings
): void {
  try {
    localStorage.setItem(storageKey(collectionId), JSON.stringify(settings))
  } catch {
    // storage unavailable — settings stay session-only
  }
}
