import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsView from './SettingsView.svelte'
import { locale } from '$lib/i18n'

const {
  settingsGetMock,
  settingsSetMock,
  testOpenrouterConnectionMock,
  testAssemblyaiConnectionMock,
  testGlmOcrConnectionMock,
  llmIsAvailableMock,
  llmLocalModelInfoMock,
  llmDownloadModelMock,
  embeddingLocalModelInfoMock,
  embeddingOpenModelsDirMock,
  embeddingDownloadModelMock,
} =
  vi.hoisted(() => ({
    settingsGetMock: vi.fn(),
    settingsSetMock: vi.fn(),
    testOpenrouterConnectionMock: vi.fn(),
    testAssemblyaiConnectionMock: vi.fn(),
    testGlmOcrConnectionMock: vi.fn(),
    llmIsAvailableMock: vi.fn(),
    llmLocalModelInfoMock: vi.fn(),
    llmDownloadModelMock: vi.fn(),
    embeddingLocalModelInfoMock: vi.fn(),
    embeddingOpenModelsDirMock: vi.fn(),
    embeddingDownloadModelMock: vi.fn(),
  }))

vi.mock('$lib/settings', async () => {
  const actual = await vi.importActual<typeof import('$lib/settings')>('$lib/settings')
  return {
    ...actual,
    settingsGet: settingsGetMock,
    settingsSet: settingsSetMock,
    testOpenrouterConnection: testOpenrouterConnectionMock,
    testAssemblyaiConnection: testAssemblyaiConnectionMock,
    testGlmOcrConnection: testGlmOcrConnectionMock,
  }
})

vi.mock('$lib/llm', () => ({
  llmIsAvailable: llmIsAvailableMock,
  llmLocalModelInfo: llmLocalModelInfoMock,
  llmOpenModelsDir: vi.fn(),
  llmDownloadModel: llmDownloadModelMock,
}))

vi.mock('$lib/embeddings', () => ({
  embeddingLocalModelInfo: embeddingLocalModelInfoMock,
  embeddingOpenModelsDir: embeddingOpenModelsDirMock,
  embeddingDownloadModel: embeddingDownloadModelMock,
}))

describe('SettingsView', () => {
  beforeEach(() => {
    locale.set('es')
    settingsGetMock.mockReset()
    settingsSetMock.mockReset().mockResolvedValue(undefined)
    testOpenrouterConnectionMock.mockReset()
    testAssemblyaiConnectionMock.mockReset().mockResolvedValue(undefined)
    testGlmOcrConnectionMock.mockReset().mockResolvedValue(undefined)
    llmIsAvailableMock.mockReset().mockResolvedValue(true)
    llmDownloadModelMock.mockReset().mockResolvedValue(undefined)
    embeddingOpenModelsDirMock.mockReset().mockResolvedValue(undefined)
    embeddingDownloadModelMock.mockReset().mockResolvedValue('started')
    embeddingLocalModelInfoMock.mockReset().mockResolvedValue({
      exists: false,
      available: false,
      can_auto_download: true,
      directory: 'C:/Users/test/AppData/Roaming/com.entropia.pro.desktop/models/embeddings/bge-m3',
      path: 'C:/Users/test/AppData/Roaming/com.entropia.pro.desktop/models/embeddings/bge-m3/model.onnx',
      size_bytes: null,
      required_files: [
        { filename: 'model.onnx', source_path: 'onnx/model.onnx', destination: 'model.onnx', size_bytes: 724923, exists: false },
        { filename: 'model.onnx_data', source_path: 'onnx/model.onnx_data', destination: 'model.onnx_data', size_bytes: 2266820608, exists: false },
        { filename: 'tokenizer.json', source_path: 'onnx/tokenizer.json', destination: 'tokenizer.json', size_bytes: 17082821, exists: false },
      ],
      missing_files: [
        { filename: 'model.onnx', source_path: 'onnx/model.onnx', destination: 'model.onnx', size_bytes: 724923, exists: false },
        { filename: 'model.onnx_data', source_path: 'onnx/model.onnx_data', destination: 'model.onnx_data', size_bytes: 2266820608, exists: false },
        { filename: 'tokenizer.json', source_path: 'onnx/tokenizer.json', destination: 'tokenizer.json', size_bytes: 17082821, exists: false },
      ],
      source_repo: 'BAAI/bge-m3',
    })
    llmLocalModelInfoMock.mockReset().mockResolvedValue({
      exists: true,
      available: true,
      can_auto_download: false,
      disabled_reason: null,
      path: '/home/test/.local/share/com.entropia.pro.desktop/models/gemma-4-E2B-it-Q4_K_M.gguf',
      size_bytes: 2_500_000_000,
      filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
      source_url:
        'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=true',
    })

    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'openrouter_api_key') return 'sk-or-v1-test-key'
      if (key === 'openrouter_model') return 'anthropic/claude-3.7-sonnet'
      if (key === 'embedding_provider') return 'api'
      if (key === 'openrouter_embedding_model') return 'baai/bge-m3'
      if (key === 'llm_mode') return 'openrouter'
      if (key === 'assemblyai_api_key') return 'aai-orig-test-1234'
      if (key === 'stt_mode') return 'assemblyai'
      if (key === 'language') return 'es'
      return null
    })
  })

  it('renders the unified header hierarchy with the active mode summary', async () => {
    render(SettingsView)

    expect(await screen.findByText('Preferencias')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Ajustá cómo EntropIA resuelve tareas locales y remotas de inteligencia artificial.'
      )
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Modo actual: OpenRouter')).toBeInTheDocument()
    })
  })

  it('shows refined success feedback for connection checks and saves', async () => {
    testOpenrouterConnectionMock.mockResolvedValue([
      { id: 'google/gemma-3-4b-it', name: 'Gemma 3 4B', context_length: 8192 },
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', context_length: 200000 },
    ])

    render(SettingsView)

    const testButtons = await screen.findAllByRole('button', { name: 'Probar conexión' })
    expect(testButtons).toHaveLength(3)

    const openrouterTestButton = testButtons[0]
    const assemblyaiTestButton = testButtons[1]
    const glmOcrTestButton = testButtons[2]
    expect(openrouterTestButton).toBeDefined()
    expect(assemblyaiTestButton).toBeDefined()
    expect(glmOcrTestButton).toBeDefined()

    await fireEvent.click(openrouterTestButton!)

    expect(await screen.findByText('Conexión lista · 2 modelos disponibles.')).toBeInTheDocument()
    expect(screen.getByText('Modelos sugeridos desde OpenRouter')).toBeInTheDocument()

    await fireEvent.click(assemblyaiTestButton!)

    expect(
      await screen.findByText('Conexión lista · AssemblyAI validó tu cuenta.')
    ).toBeInTheDocument()
    expect(screen.getByText(/aai-o\*\*\*\*\.\.\.\*\*\*\*1234/)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText(
        'Configuración guardada. Ya podés usar esta preferencia en toda la app.'
      )
    ).toBeInTheDocument()
    expect(settingsSetMock).toHaveBeenCalledWith('embedding_provider', 'api')
    expect(settingsSetMock).toHaveBeenCalledWith('openrouter_embedding_model', 'baai/bge-m3')
    expect(settingsSetMock).toHaveBeenCalledWith('local_embedding_model_dir', '')
  })

  it('saves the local BGE-M3 embedding provider and model directory', async () => {
    render(SettingsView)

    const localEmbeddingOption = await screen.findByRole('radio', { name: /Local ONNX/i })
    await fireEvent.click(localEmbeddingOption)

    const localPathInput = await screen.findByLabelText('Carpeta del modelo local BGE-M3')
    await fireEvent.input(localPathInput, { target: { value: 'C:/models/bge-m3' } })

    await fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('embedding_provider', 'local')
      expect(settingsSetMock).toHaveBeenCalledWith('openrouter_embedding_model', 'baai/bge-m3')
      expect(settingsSetMock).toHaveBeenCalledWith('local_embedding_model_dir', 'C:/models/bge-m3')
    })
  })

  it('shows local BGE-M3 install status and can start the embedding asset download', async () => {
    render(SettingsView)

    const localEmbeddingOption = await screen.findByRole('radio', { name: /Local ONNX/i })
    await fireEvent.click(localEmbeddingOption)

    expect(await screen.findByText('Modelo BGE-M3 local incompleto')).toBeInTheDocument()
    expect(screen.getAllByText(/model\.onnx_data/).length).toBeGreaterThan(0)
    expect(screen.getByText(/BAAI\/bge-m3/)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Instalar BGE-M3 local' }))

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('embedding_provider', 'local')
      expect(settingsSetMock).toHaveBeenCalledWith('openrouter_embedding_model', 'baai/bge-m3')
      expect(settingsSetMock).toHaveBeenCalledWith('local_embedding_model_dir', '')
      expect(embeddingDownloadModelMock).toHaveBeenCalled()
    })
  })

  it('keeps the local BGE-M3 directory setting empty when using the AppData default', async () => {
    settingsGetMock.mockImplementation(async (key: string) => {
      if (key === 'embedding_provider') return 'local'
      if (key === 'local_embedding_model_dir') return 'resources/models/embeddings/bge-m3'
      if (key === 'openrouter_embedding_model') return 'baai/bge-m3'
      if (key === 'llm_mode') return 'openrouter'
      if (key === 'stt_mode') return 'assemblyai'
      if (key === 'language') return 'es'
      return null
    })

    render(SettingsView)

    const localPathInput = await screen.findByLabelText('Carpeta del modelo local BGE-M3')
    expect(localPathInput).toHaveValue('')
    expect(
      await screen.findByText(
        'C:/Users/test/AppData/Roaming/com.entropia.pro.desktop/models/embeddings/bge-m3',
      )
    ).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('local_embedding_model_dir', '')
    })
  })

  it('opens the local BGE-M3 embeddings folder from Settings', async () => {
    render(SettingsView)

    const localEmbeddingOption = await screen.findByRole('radio', { name: /Local ONNX/i })
    await fireEvent.click(localEmbeddingOption)
    await fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta BGE-M3' }))

    await waitFor(() => {
      expect(embeddingOpenModelsDirMock).toHaveBeenCalled()
    })
  })

  it('saves language preference and updates the interface reactively', async () => {
    render(SettingsView)

    const languageSelect = await screen.findByLabelText('Idioma')
    await fireEvent.change(languageSelect, { target: { value: 'en' } })
    expect((languageSelect as HTMLSelectElement).value).toBe('en')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith('language', 'en')
      expect(settingsSetMock).toHaveBeenCalledWith('stt_mode', 'assemblyai')
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    })
  })

  it('prefills the local Gemma download source from backend defaults', async () => {
    llmIsAvailableMock.mockResolvedValue(false)
    llmLocalModelInfoMock.mockResolvedValue({
      exists: false,
      available: true,
      can_auto_download: true,
      disabled_reason: null,
      path: '/home/test/.local/share/com.entropia.pro.desktop/models/gemma-4-E2B-it-Q4_K_M.gguf',
      size_bytes: null,
      filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
      source_url:
        'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=true',
    })

    render(SettingsView)

    const sourceInput = await screen.findByLabelText('Fuente de descarga')
    expect(await screen.findByText('Listo para descargar desde la app')).toBeInTheDocument()
    expect(sourceInput).toHaveValue(
      'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=true'
    )
    expect(screen.getByLabelText('Nombre de archivo esperado')).toHaveValue(
      'gemma-4-E2B-it-Q4_K_M.gguf'
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Descargar modelo' }))

    await waitFor(() => {
      expect(settingsSetMock).toHaveBeenCalledWith(
        'local_model_source_url',
        'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=true'
      )
      expect(settingsSetMock).toHaveBeenCalledWith(
        'local_model_filename',
        'gemma-4-E2B-it-Q4_K_M.gguf'
      )
      expect(llmDownloadModelMock).toHaveBeenCalled()
    })
  })
})
