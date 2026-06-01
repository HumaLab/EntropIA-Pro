import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import {
  settingsGet,
  settingsSet,
  settingsGetAll,
  settingsDelete,
  testOpenrouterConnection,
  testAssemblyaiConnection,
  testGlmOcrConnection,
  SETTINGS_KEYS,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_LLM_MODE,
  DEFAULT_STT_MODE,
  DEFAULT_OCRH_MODE,
} from './settings'

const mockInvoke = vi.mocked(invoke)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('settings', () => {
  describe('settingsGet', () => {
    it('calls invoke with correct command and key', async () => {
      mockInvoke.mockResolvedValueOnce('test-value')
      const result = await settingsGet('my_key')
      expect(mockInvoke).toHaveBeenCalledWith('settings_get', { key: 'my_key' })
      expect(result).toBe('test-value')
    })

    it('returns null when setting does not exist', async () => {
      mockInvoke.mockResolvedValueOnce(null)
      const result = await settingsGet('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('settingsSet', () => {
    it('calls invoke with correct command, key and value', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await settingsSet('my_key', 'my_value')
      expect(mockInvoke).toHaveBeenCalledWith('settings_set', {
        key: 'my_key',
        value: 'my_value',
      })
    })
  })

  describe('settingsGetAll', () => {
    it('returns array of settings', async () => {
      const mockSettings = [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]
      mockInvoke.mockResolvedValueOnce(mockSettings)
      const result = await settingsGetAll()
      expect(mockInvoke).toHaveBeenCalledWith('settings_get_all')
      expect(result).toEqual(mockSettings)
    })
  })

  describe('settingsDelete', () => {
    it('calls invoke with correct command and key', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await settingsDelete('my_key')
      expect(mockInvoke).toHaveBeenCalledWith('settings_delete', { key: 'my_key' })
    })
  })

  describe('testOpenrouterConnection', () => {
    it('calls invoke with api key', async () => {
      const mockModels = [{ id: 'google/gemma-3-4b-it', name: 'Gemma 3 4B', context_length: 8192 }]
      mockInvoke.mockResolvedValueOnce(mockModels)
      const result = await testOpenrouterConnection('sk-or-test')
      expect(mockInvoke).toHaveBeenCalledWith('test_openrouter_connection', {
        apiKey: 'sk-or-test',
      })
      expect(result).toEqual(mockModels)
    })
  })

  describe('testAssemblyaiConnection', () => {
    it('calls invoke with api key', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await testAssemblyaiConnection('aai-test')
      expect(mockInvoke).toHaveBeenCalledWith('test_assemblyai_connection', {
        apiKey: 'aai-test',
      })
    })
  })

  describe('testGlmOcrConnection', () => {
    it('calls invoke with api key', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await testGlmOcrConnection('glm-test')
      expect(mockInvoke).toHaveBeenCalledWith('test_glm_ocr_connection', {
        apiKey: 'glm-test',
      })
    })
  })

  describe('constants', () => {
    it('exports well-known setting keys', () => {
      expect(SETTINGS_KEYS.OPENROUTER_API_KEY).toBe('openrouter_api_key')
      expect(SETTINGS_KEYS.OPENROUTER_MODEL).toBe('openrouter_model')
      expect(SETTINGS_KEYS.LLM_MODE).toBe('llm_mode')
      expect(SETTINGS_KEYS.ASSEMBLYAI_API_KEY).toBe('assemblyai_api_key')
      expect(SETTINGS_KEYS.STT_MODE).toBe('stt_mode')
      expect(SETTINGS_KEYS.GLM_OCR_API_KEY).toBe('glm_ocr_api_key')
      expect(SETTINGS_KEYS.OCRH_MODE).toBe('ocrh_mode')
      expect(SETTINGS_KEYS.LANGUAGE).toBe('language')
      expect(SETTINGS_KEYS.PYTHON_RUNTIME_SELECTION).toBe('python.runtime_selection')
    })

    it('has correct defaults', () => {
      expect(DEFAULT_OPENROUTER_MODEL).toBe('google/gemma-3-4b-it')
      expect(DEFAULT_LLM_MODE).toBe('local')
      expect(DEFAULT_STT_MODE).toBe('local')
      expect(DEFAULT_OCRH_MODE).toBe('local')
    })
  })
})
