/**
 * Settings frontend client for EntropIA Pro desktop app.
 * Wraps Tauri commands for the app_settings key-value store.
 */

import { invoke } from '@tauri-apps/api/core'

export interface SettingEntry {
  key: string
  value: string
}

export interface ModelInfo {
  id: string
  name: string
  context_length: number
}

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

export function settingsGet(key: string): Promise<string | null> {
  return invoke<string | null>('settings_get', { key })
}

export function settingsSet(key: string, value: string): Promise<void> {
  return invoke<void>('settings_set', { key, value })
}

export function settingsGetAll(): Promise<SettingEntry[]> {
  return invoke<SettingEntry[]>('settings_get_all')
}

export function settingsDelete(key: string): Promise<void> {
  return invoke<void>('settings_delete', { key })
}

// ---------------------------------------------------------------------------
// OpenRouter-specific
// ---------------------------------------------------------------------------

export function testOpenrouterConnection(apiKey: string): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>('test_openrouter_connection', { apiKey })
}

export function testAssemblyaiConnection(apiKey: string): Promise<void> {
  return invoke<void>('test_assemblyai_connection', { apiKey })
}

export function testGlmOcrConnection(apiKey: string): Promise<void> {
  return invoke<void>('test_glm_ocr_connection', { apiKey })
}

// ---------------------------------------------------------------------------
// Well-known setting keys
// ---------------------------------------------------------------------------

export const SETTINGS_KEYS = {
  OPENROUTER_API_KEY: 'openrouter_api_key',
  OPENROUTER_MODEL: 'openrouter_model',
  OPENROUTER_EMBEDDING_MODEL: 'openrouter_embedding_model',
  LLM_MODE: 'llm_mode',
  EMBEDDING_PROVIDER: 'embedding_provider',
  LOCAL_EMBEDDING_MODEL_DIR: 'local_embedding_model_dir',
  ASSEMBLYAI_API_KEY: 'assemblyai_api_key',
  STT_MODE: 'stt_mode',
  GLM_OCR_API_KEY: 'glm_ocr_api_key',
  OCRH_MODE: 'ocrh_mode',
  LANGUAGE: 'language',
  DEPS_VENV_PYTHON_PATH: 'deps_venv_python_path',
  PYTHON_RUNTIME_SELECTION: 'python.runtime_selection',
  LOCAL_MODEL_FILENAME: 'local_model_filename',
  LOCAL_MODEL_SOURCE_URL: 'local_model_source_url',
} as const

export type LlmMode = 'local' | 'openrouter' | 'auto'
export type EmbeddingProvider = 'api' | 'local'
export type SttMode = 'local' | 'assemblyai' | 'auto'
export type OcrhMode = 'local' | 'glm_ocr' | 'auto'

export const DEFAULT_OPENROUTER_MODEL = 'google/gemma-3-4b-it'
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'baai/bge-m3'
export const DEFAULT_LLM_MODE: LlmMode = 'local'
export const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = 'local'
export const DEFAULT_STT_MODE: SttMode = 'local'
export const DEFAULT_OCRH_MODE: OcrhMode = 'local'
