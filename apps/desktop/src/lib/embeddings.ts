import { invoke } from '@tauri-apps/api/core'

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
  return invoke<LocalEmbeddingModelInfo>('embedding_local_model_info')
}

export function embeddingOpenModelsDir(): Promise<void> {
  return invoke<void>('embedding_open_models_dir')
}

export function embeddingDownloadModel(): Promise<string> {
  return invoke<string>('embedding_download_model')
}
