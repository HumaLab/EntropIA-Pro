import { invoke } from '@tauri-apps/api/core'

// API-only (lite) variant: no local embedding model. SettingsView static-imports
// this module, so it stays importable; the local-model functions flip inert
// under OFF. Inline compare so the define()'d literal tree-shakes.
const OFF = import.meta.env.VITE_LOCAL_ML !== '1'

export interface LocalEmbeddingModelFileInfo {
  filename: string
  source_path: string
  destination: string
  size_bytes: number | null
  exists: boolean
}

export interface LocalEmbeddingModelInfo {
  exists: boolean
  available: boolean
  can_auto_download: boolean
  directory: string
  path: string
  size_bytes: number | null
  required_files: LocalEmbeddingModelFileInfo[]
  missing_files: LocalEmbeddingModelFileInfo[]
  source_repo: string
}

export interface EmbeddingDownloadProgressPayload {
  pct: number
  downloaded_bytes: number
  total_bytes: number | null
  file: string
}

export interface EmbeddingDownloadCompletePayload {
  path: string
}

export interface EmbeddingDownloadErrorPayload {
  error: string
}

export function embeddingLocalModelInfo(): Promise<LocalEmbeddingModelInfo> {
  if (OFF) {
    return Promise.resolve({
      exists: false,
      available: false,
      can_auto_download: false,
      directory: '',
      path: '',
      size_bytes: null,
      required_files: [],
      missing_files: [],
      source_repo: '',
    })
  }
  return invoke<LocalEmbeddingModelInfo>('embedding_local_model_info')
}

export function embeddingOpenModelsDir(): Promise<void> {
  if (OFF) return Promise.resolve()
  return invoke<void>('embedding_open_models_dir')
}

export function embeddingDownloadModel(): Promise<string> {
  if (OFF) return Promise.resolve('')
  return invoke<string>('embedding_download_model')
}
