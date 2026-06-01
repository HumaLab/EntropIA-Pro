<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { locale, isLocale, t, type Locale } from '$lib/i18n'
  import {
    settingsGet,
    settingsSet,
    testOpenrouterConnection,
    testAssemblyaiConnection,
    testGlmOcrConnection,
    SETTINGS_KEYS,
    DEFAULT_OPENROUTER_MODEL,
    DEFAULT_OPENROUTER_EMBEDDING_MODEL,
    DEFAULT_LLM_MODE,
    DEFAULT_EMBEDDING_PROVIDER,
    DEFAULT_STT_MODE,
    DEFAULT_OCRH_MODE,
    type EmbeddingProvider,
    type LlmMode,
    type OcrhMode,
    type SttMode,
    type ModelInfo,
  } from '$lib/settings'
  import {
    llmLocalModelInfo,
    llmOpenModelsDir,
    llmDownloadModel,
    type LocalModelInfo,
    type LlmDownloadProgressPayload,
    type LlmDownloadCompletePayload,
    type LlmDownloadErrorPayload,
  } from '$lib/llm'
  import {
    embeddingLocalModelInfo,
    embeddingOpenModelsDir,
    embeddingDownloadModel,
    type LocalEmbeddingModelInfo,
    type EmbeddingDownloadProgressPayload,
    type EmbeddingDownloadCompletePayload,
    type EmbeddingDownloadErrorPayload,
  } from '$lib/embeddings'
  import { isCriticalMissing, onCriticalMissingChange } from '$lib/deps'
  import { listen, type UnlistenFn } from '@tauri-apps/api/event'
  import { Button, Card, Input } from '@entropia/ui'
  import DependenciasTab from './DependenciasTab.svelte'
  import LogsTab from './LogsTab.svelte'

  // Tab state — auto-open deps tab if critical deps are missing
  let hasDepsWarning = $state(isCriticalMissing())
  const unsubDeps = onCriticalMissingChange((v) => { hasDepsWarning = v })
  let activeTab = $state<'openrouter' | 'dependencias' | 'logs'>(
    isCriticalMissing() ? 'dependencias' : 'openrouter',
  )

  // State
  let apiKey = $state('')
  let maskedApiKey = $state('')
  let showApiKey = $state(false)
  let model = $state(DEFAULT_OPENROUTER_MODEL)
  let embeddingProvider = $state<EmbeddingProvider>(DEFAULT_EMBEDDING_PROVIDER)
  let embeddingModel = $state(DEFAULT_OPENROUTER_EMBEDDING_MODEL)
  let localEmbeddingModelDir = $state('')
  let localEmbeddingModel = $state<LocalEmbeddingModelInfo | null>(null)
  let llmMode = $state<LlmMode>(DEFAULT_LLM_MODE)
  let sttMode = $state<SttMode>(DEFAULT_STT_MODE)
  let ocrhMode = $state<OcrhMode>(DEFAULT_OCRH_MODE)
  let localAvailable = $state(false)
  let localModel = $state<LocalModelInfo | null>(null)
  let selectedLocale = $state<Locale>('es')
  let languageTouched = $state(false)
  let assemblyAiApiKey = $state('')
  let maskedAssemblyAiApiKey = $state('')
  let showAssemblyAiApiKey = $state(false)
  let glmOcrApiKey = $state('')
  let maskedGlmOcrApiKey = $state('')
  let showGlmOcrApiKey = $state(false)

  // Test connection state
  let testing = $state(false)
  let testResult = $state<{ success: boolean; message: string } | null>(null)
  let testingAssemblyAi = $state(false)
  let assemblyAiTestResult = $state<{ success: boolean; message: string } | null>(null)
  let testingGlmOcr = $state(false)
  let glmOcrTestResult = $state<{ success: boolean; message: string } | null>(null)
  let availableModels = $state<ModelInfo[]>([])

  const LANGUAGE_KEY = 'language'
  const LEGACY_LOCAL_EMBEDDING_MODEL_DIR = 'resources/models/embeddings/bge-m3'

  // Local model download state
  let downloading = $state(false)
  let downloadPct = $state(0)
  let downloadError = $state<string | null>(null)
  let localModelSourceUrl = $state('')
  let localModelFilename = $state('')
  let downloadUnlisteners: UnlistenFn[] = []
  let embeddingDownloading = $state(false)
  let embeddingDownloadPct = $state(0)
  let embeddingDownloadFile = $state('')
  let embeddingDownloadError = $state<string | null>(null)

  // Save state
  let saving = $state(false)
  let saveFeedback = $state<{ tone: 'success' | 'error'; text: string } | null>(null)

  let currentModeLabel = $derived(
    llmMode === 'local'
      ? t('settings.llmMode.local.label')
      : llmMode === 'openrouter'
        ? t('settings.llmMode.openrouter.label')
        : t('settings.llmMode.auto.label')
  )

  let currentModeDescription = $derived(
    llmMode === 'local'
      ? t('settings.llmMode.local.summary')
      : llmMode === 'openrouter'
        ? t('settings.llmMode.openrouter.summary')
        : t('settings.llmMode.auto.summary')
  )

  let currentSttModeDescription = $derived(
    sttMode === 'local'
      ? t('settings.sttMode.local.summary')
      : sttMode === 'assemblyai'
        ? t('settings.sttMode.assemblyai.summary')
        : t('settings.sttMode.auto.summary')
  )

  let currentOcrhModeDescription = $derived(
    ocrhMode === 'local'
      ? t('settings.ocrhMode.local.summary')
      : ocrhMode === 'glm_ocr'
        ? t('settings.ocrhMode.glm_ocr.summary')
        : t('settings.ocrhMode.auto.summary')
  )

  const activeLocale = $derived($locale)

  onDestroy(() => {
    unsubDeps()
    downloadUnlisteners.forEach((fn) => fn())
    downloadUnlisteners = []
  })

  onMount(async () => {
    const [
      storedKey,
      storedModel,
      storedEmbeddingProvider,
      storedEmbeddingModel,
      storedLocalEmbeddingModelDir,
      storedMode,
      storedSttMode,
      storedOcrhMode,
      storedAssemblyAiKey,
      storedGlmOcrKey,
      storedLanguage,
      modelInfo,
      embeddingModelInfo,
    ] = await Promise.all([
      settingsGet(SETTINGS_KEYS.OPENROUTER_API_KEY),
      settingsGet(SETTINGS_KEYS.OPENROUTER_MODEL),
      settingsGet(SETTINGS_KEYS.EMBEDDING_PROVIDER),
      settingsGet(SETTINGS_KEYS.OPENROUTER_EMBEDDING_MODEL),
      settingsGet(SETTINGS_KEYS.LOCAL_EMBEDDING_MODEL_DIR),
      settingsGet(SETTINGS_KEYS.LLM_MODE),
      settingsGet(SETTINGS_KEYS.STT_MODE),
      settingsGet(SETTINGS_KEYS.OCRH_MODE),
      settingsGet(SETTINGS_KEYS.ASSEMBLYAI_API_KEY),
      settingsGet(SETTINGS_KEYS.GLM_OCR_API_KEY),
      settingsGet(LANGUAGE_KEY),
      llmLocalModelInfo().catch(() => null),
      embeddingLocalModelInfo().catch(() => null),
    ])

    if (storedKey) {
      apiKey = storedKey
      maskedApiKey = maskKey(storedKey)
    }
    if (storedModel) model = storedModel
    if (storedEmbeddingProvider === 'api' || storedEmbeddingProvider === 'local') {
      embeddingProvider = storedEmbeddingProvider
    }
    if (storedEmbeddingModel) embeddingModel = storedEmbeddingModel
    if (storedLocalEmbeddingModelDir && !isLegacyLocalEmbeddingModelDir(storedLocalEmbeddingModelDir)) {
      localEmbeddingModelDir = storedLocalEmbeddingModelDir
    }
    if (storedMode) llmMode = storedMode as LlmMode
    if (storedSttMode) sttMode = storedSttMode as SttMode
    if (storedOcrhMode) ocrhMode = storedOcrhMode as OcrhMode
    if (storedAssemblyAiKey) {
      assemblyAiApiKey = storedAssemblyAiKey
      maskedAssemblyAiApiKey = maskKey(storedAssemblyAiKey, 5)
    }
    if (storedGlmOcrKey) {
      glmOcrApiKey = storedGlmOcrKey
      maskedGlmOcrApiKey = maskKey(storedGlmOcrKey, 0)
    }
    if (!languageTouched) {
      selectedLocale = isLocale(storedLanguage) ? storedLanguage : get(locale)
    }
    localModel = modelInfo
    localAvailable = modelInfo?.available ?? false
    localModelSourceUrl = modelInfo?.source_url ?? ''
    localModelFilename = modelInfo?.filename ?? ''
    localEmbeddingModel = embeddingModelInfo

    // Listen to model download events
    downloadUnlisteners.push(
      await listen<LlmDownloadProgressPayload>('llm:download_progress', (event) => {
        downloading = true
        downloadPct = event.payload.pct
        downloadError = null
      }),
      await listen<LlmDownloadCompletePayload>('llm:download_complete', async () => {
        downloading = false
        downloadPct = 100
        downloadError = null
        localModel = await llmLocalModelInfo().catch(() => null)
        localAvailable = localModel?.available ?? false
      }),
      await listen<LlmDownloadErrorPayload>('llm:download_error', (event) => {
        downloading = false
        downloadPct = 0
        downloadError = event.payload.error
      }),
      await listen<EmbeddingDownloadProgressPayload>('embedding:download_progress', (event) => {
        embeddingDownloading = true
        embeddingDownloadPct = event.payload.pct
        embeddingDownloadFile = event.payload.file
        embeddingDownloadError = null
      }),
      await listen<EmbeddingDownloadCompletePayload>('embedding:download_complete', async () => {
        embeddingDownloading = false
        embeddingDownloadPct = 100
        embeddingDownloadFile = ''
        embeddingDownloadError = null
        localEmbeddingModel = await embeddingLocalModelInfo().catch(() => null)
      }),
      await listen<EmbeddingDownloadErrorPayload>('embedding:download_error', (event) => {
        embeddingDownloading = false
        embeddingDownloadPct = 0
        embeddingDownloadFile = ''
        embeddingDownloadError = event.payload.error
      }),
    )
  })

  function maskKey(key: string, prefixLength = 4): string {
    const trimmed = key.trim()
    if (!trimmed) return ''
    if (trimmed.length <= prefixLength + 4) return '*'.repeat(trimmed.length)
    return `${trimmed.slice(0, prefixLength)}****...****${trimmed.slice(-4)}`
  }

  async function handleTestConnection() {
    if (!apiKey.trim()) {
      testResult = { success: false, message: t('settings.enterApiKey') }
      return
    }
    testing = true
    testResult = null
    try {
      const models = await testOpenrouterConnection(apiKey.trim())
      availableModels = models
      testResult = {
        success: true,
        message: t('settings.connectionReady', { count: models.length }),
      }
    } catch (e) {
      testResult = {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      }
    } finally {
      testing = false
    }
  }

  async function handleTestAssemblyAiConnection() {
    if (!assemblyAiApiKey.trim()) {
      assemblyAiTestResult = { success: false, message: t('settings.enterAssemblyAiApiKey') }
      return
    }

    testingAssemblyAi = true
    assemblyAiTestResult = null
    try {
      await testAssemblyaiConnection(assemblyAiApiKey.trim())
      assemblyAiTestResult = {
        success: true,
        message: t('settings.assemblyAiConnectionReady'),
      }
    } catch (e) {
      assemblyAiTestResult = {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      }
    } finally {
      testingAssemblyAi = false
    }
  }

  async function handleTestGlmOcrConnection() {
    if (!glmOcrApiKey.trim()) {
      glmOcrTestResult = { success: false, message: t('settings.enterGlmOcrApiKey') }
      return
    }

    testingGlmOcr = true
    glmOcrTestResult = null
    try {
      await testGlmOcrConnection(glmOcrApiKey.trim())
      glmOcrTestResult = {
        success: true,
        message: t('settings.glmOcrConnectionReady'),
      }
    } catch (e) {
      glmOcrTestResult = {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      }
    } finally {
      testingGlmOcr = false
    }
  }

  async function handleSave() {
    saving = true
    saveFeedback = null
    try {
      await Promise.all([
        settingsSet(SETTINGS_KEYS.OPENROUTER_API_KEY, apiKey.trim()),
        settingsSet(SETTINGS_KEYS.OPENROUTER_MODEL, model),
        settingsSet(SETTINGS_KEYS.EMBEDDING_PROVIDER, embeddingProvider),
        settingsSet(SETTINGS_KEYS.OPENROUTER_EMBEDDING_MODEL, embeddingModel.trim() || DEFAULT_OPENROUTER_EMBEDDING_MODEL),
        settingsSet(SETTINGS_KEYS.LOCAL_EMBEDDING_MODEL_DIR, localEmbeddingModelDir.trim()),
        settingsSet(SETTINGS_KEYS.LLM_MODE, llmMode),
        settingsSet(SETTINGS_KEYS.ASSEMBLYAI_API_KEY, assemblyAiApiKey.trim()),
        settingsSet(SETTINGS_KEYS.STT_MODE, sttMode),
        settingsSet(SETTINGS_KEYS.GLM_OCR_API_KEY, glmOcrApiKey.trim()),
        settingsSet(SETTINGS_KEYS.OCRH_MODE, ocrhMode),
        settingsSet(LANGUAGE_KEY, selectedLocale),
        settingsSet(SETTINGS_KEYS.LOCAL_MODEL_SOURCE_URL, localModelSourceUrl.trim()),
        settingsSet(SETTINGS_KEYS.LOCAL_MODEL_FILENAME, (localModelFilename.trim() || localModel?.filename) ?? ''),
      ])
      maskedApiKey = maskKey(apiKey)
      maskedAssemblyAiApiKey = maskKey(assemblyAiApiKey, 5)
      maskedGlmOcrApiKey = maskKey(glmOcrApiKey, 0)
      saveFeedback = {
        tone: 'success',
        text: t('settings.saved'),
      }
      setTimeout(() => {
        saveFeedback = null
      }, 3000)
    } catch (e) {
      saveFeedback = {
        tone: 'error',
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
      }
    } finally {
      saving = false
    }
  }

  function handleModelSelect(modelId: string) {
    model = modelId
  }

  function formatBytes(bytes: number | null): string {
    if (bytes == null) return '—'
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  function handleLanguageChange(event: Event) {
    const nextLocale = (event.target as HTMLSelectElement).value as Locale
    languageTouched = true
    selectedLocale = nextLocale
    locale.set(nextLocale)
  }

  async function handleDownloadModel() {
    if (downloading) return
    const sourceUrl = localModelSourceUrl.trim() || localModel?.source_url || ''
    const filename = localModelFilename.trim() || localModel?.filename || ''
    if (!sourceUrl) {
      downloadError = t('settings.localModel.sourceUrlRequired')
      return
    }
    downloading = true
    downloadPct = 0
    downloadError = null
    try {
      await Promise.all([
        settingsSet(SETTINGS_KEYS.LOCAL_MODEL_SOURCE_URL, sourceUrl),
        settingsSet(SETTINGS_KEYS.LOCAL_MODEL_FILENAME, filename),
      ])
      await llmDownloadModel()
    } catch (e) {
      downloading = false
      downloadError = e instanceof Error ? e.message : String(e)
    }
  }

  function isLegacyLocalEmbeddingModelDir(value: string): boolean {
    const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase()
    return (
      normalized === LEGACY_LOCAL_EMBEDDING_MODEL_DIR ||
      normalized.endsWith(`/${LEGACY_LOCAL_EMBEDDING_MODEL_DIR}`)
    )
  }

  async function handleDownloadEmbeddingModel() {
    if (embeddingDownloading) return
    embeddingDownloading = true
    embeddingDownloadPct = 0
    embeddingDownloadError = null
    try {
      await Promise.all([
        settingsSet(SETTINGS_KEYS.EMBEDDING_PROVIDER, 'local'),
        settingsSet(
          SETTINGS_KEYS.OPENROUTER_EMBEDDING_MODEL,
          embeddingModel.trim() || DEFAULT_OPENROUTER_EMBEDDING_MODEL
        ),
        settingsSet(SETTINGS_KEYS.LOCAL_EMBEDDING_MODEL_DIR, localEmbeddingModelDir.trim()),
      ])
      embeddingProvider = 'local'
      await embeddingDownloadModel()
    } catch (e) {
      embeddingDownloading = false
      embeddingDownloadError = e instanceof Error ? e.message : String(e)
    }
  }
</script>

{#key activeLocale}
  <div class="settings-view page-shell" data-locale={activeLocale}>
    <section class="page-header settings-view__header">
      <div class="page-header__content">
        <span class="page-header__eyebrow">{t('settings.preferences')}</span>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
        <span class="page-header__meta"
          >{t('settings.currentMode', { mode: currentModeLabel })}</span
        >
      </div>

      <div class="page-toolbar settings-view__toolbar">
        <Button variant="primary" onclick={handleSave} disabled={saving}>
          {saving ? t('settings.saving') : t('settings.save')}
        </Button>
      </div>
    </section>

    <!-- Tab navigation -->
    <nav class="settings-tabs" aria-label="Secciones de configuración">
      <button
        class="settings-tab"
        class:settings-tab--active={activeTab === 'openrouter'}
        type="button"
        onclick={() => (activeTab = 'openrouter')}
      >
        LLM, OCR y STT
      </button>
      <button
        class="settings-tab"
        class:settings-tab--active={activeTab === 'dependencias'}
        type="button"
        onclick={() => (activeTab = 'dependencias')}
      >
        Dependencias de IA
        {#if hasDepsWarning}
          <span class="settings-tab__badge"></span>
        {/if}
      </button>
      <button
        class="settings-tab"
        class:settings-tab--active={activeTab === 'logs'}
        type="button"
        onclick={() => (activeTab = 'logs')}
      >
        Logs
      </button>
    </nav>

    {#if activeTab === 'openrouter'}
    {#if saveFeedback}
      <p
        class="surface-message"
        class:surface-message--error={saveFeedback.tone === 'error'}
        class:surface-message--success={saveFeedback.tone === 'success'}
      >
        {saveFeedback.text}
      </p>
    {/if}

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.languageTitle')}</h2>
          <p>{t('settings.languageDescription')}</p>
        </div>

        <div class="settings__field settings__field--stacked">
          <label class="settings__label" for="language-select">{t('settings.languageLabel')}</label>
          <select
            id="language-select"
            class="settings__input"
            bind:value={selectedLocale}
            onchange={handleLanguageChange}
          >
            <option value="es">{t('settings.languageOptionEs')}</option>
            <option value="en">{t('settings.languageOptionEn')}</option>
          </select>
        </div>
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.llmModeTitle')}</h2>
          <p>{currentModeDescription}</p>
        </div>

        <div class="settings__mode-options">
          <label class="settings__radio" class:active={llmMode === 'local'}>
            <input type="radio" name="llm_mode" value="local" bind:group={llmMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.llmMode.local.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.llmMode.local.description')}
                {#if localModel?.exists}
                  <span class="settings__badge settings__badge--ok"
                    >{t('settings.badge.available')}</span
                  >
                {:else if localModel?.can_auto_download || localAvailable}
                  <span class="settings__badge settings__badge--warn"
                    >{t('settings.badge.downloadable')}</span
                  >
                {:else}
                  <span class="settings__badge settings__badge--warn"
                    >{t('settings.badge.notFound')}</span
                  >
                {/if}
              </span>
            </div>
          </label>

          <label class="settings__radio" class:active={llmMode === 'openrouter'}>
            <input type="radio" name="llm_mode" value="openrouter" bind:group={llmMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.llmMode.openrouter.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.llmMode.openrouter.description')}
              </span>
            </div>
          </label>

          <label class="settings__radio" class:active={llmMode === 'auto'}>
            <input type="radio" name="llm_mode" value="auto" bind:group={llmMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.llmMode.auto.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.llmMode.auto.description')}
              </span>
            </div>
          </label>
        </div>
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.embeddingProvider.title')}</h2>
          <p>{t('settings.embeddingProvider.description')}</p>
        </div>

        <div class="settings__mode-options">
          <label class="settings__radio" class:active={embeddingProvider === 'api'}>
            <input type="radio" name="embedding_provider" value="api" bind:group={embeddingProvider} />
            <div class="settings__radio-content">
              <strong>{t('settings.embeddingProvider.api.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.embeddingProvider.api.description')}
              </span>
            </div>
          </label>

          <label class="settings__radio" class:active={embeddingProvider === 'local'}>
            <input type="radio" name="embedding_provider" value="local" bind:group={embeddingProvider} />
            <div class="settings__radio-content">
              <strong>{t('settings.embeddingProvider.local.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.embeddingProvider.local.description')}
              </span>
            </div>
          </label>
        </div>

        <div class="settings__field settings__field--stacked">
          <Input
            label={t('settings.embeddingProvider.model')}
            type="text"
            bind:value={embeddingModel}
            placeholder={DEFAULT_OPENROUTER_EMBEDDING_MODEL}
          />
          <p class="settings__hint">{t('settings.embeddingProvider.modelHint')}</p>
        </div>

        {#if embeddingProvider === 'local'}
          <div class="settings__field settings__field--stacked">
            <label class="settings__label" for="local-embedding-model-dir">
              {t('settings.embeddingProvider.localPath')}
            </label>
            <input
              id="local-embedding-model-dir"
              type="text"
              class="settings__input"
              bind:value={localEmbeddingModelDir}
              placeholder={t('settings.embeddingProvider.localPathPlaceholder')}
            />
            <p class="settings__hint">{t('settings.embeddingProvider.localPathHint')}</p>
          </div>

          {#if localEmbeddingModel}
            <div class="settings__local-model">
              <div class="settings__local-model-row">
                <span class="settings__label">{t('settings.embeddingProvider.localStatus')}</span>
                {#if localEmbeddingModel.available}
                  <span class="settings__badge settings__badge--ok">{t('settings.embeddingProvider.localComplete')}</span>
                {:else}
                  <span class="settings__badge settings__badge--warn">{t('settings.embeddingProvider.localIncomplete')}</span>
                {/if}
              </div>

              <div class="settings__local-model-row">
                <span class="settings__label">{t('settings.embeddingProvider.localPath')}</span>
                <code class="settings__local-model-path">{localEmbeddingModel.directory}</code>
              </div>

              <p class="settings__hint">
                {t('settings.embeddingProvider.localInstallHint', { repo: localEmbeddingModel.source_repo })}
              </p>

              {#if localEmbeddingModel.missing_files.length > 0}
                <ul class="settings__hint">
                  {#each localEmbeddingModel.missing_files as file}
                    <li><code>{file.filename}</code> ← {file.source_path} ({formatBytes(file.size_bytes)})</li>
                  {/each}
                </ul>
              {/if}

              {#if embeddingDownloading}
                <div class="settings__download-progress">
                  <span class="settings__download-progress-bar" style="width: {embeddingDownloadPct}%"></span>
                  <span class="settings__download-progress-text">
                    {embeddingDownloadPct}% — {embeddingDownloadFile || t('settings.embeddingProvider.downloading')}
                  </span>
                </div>
              {:else if !localEmbeddingModel.available}
                <Button variant="primary" size="sm" onclick={handleDownloadEmbeddingModel}>
                  {t('settings.embeddingProvider.installLocal')}
                </Button>
              {/if}

              {#if embeddingDownloadError}
                <p class="surface-message surface-message--error">{embeddingDownloadError}</p>
              {/if}

              <Button variant="secondary" size="sm" onclick={() => embeddingOpenModelsDir()}>
                {t('settings.embeddingProvider.openLocalFolder')}
              </Button>
            </div>
          {/if}
        {:else}
          <p class="settings__hint settings__hint--privacy">
            {t('settings.embeddingProvider.apiPrivacyNotice')}
          </p>
        {/if}
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.sttModeTitle')}</h2>
          <p>{currentSttModeDescription}</p>
        </div>

        <div class="settings__mode-options">
          <label class="settings__radio" class:active={sttMode === 'local'}>
            <input type="radio" name="stt_mode" value="local" bind:group={sttMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.sttMode.local.label')}</strong>
              <span class="settings__radio-desc">{t('settings.sttMode.local.description')}</span>
            </div>
          </label>

          <label class="settings__radio" class:active={sttMode === 'assemblyai'}>
            <input type="radio" name="stt_mode" value="assemblyai" bind:group={sttMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.sttMode.assemblyai.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.sttMode.assemblyai.description')}
              </span>
            </div>
          </label>

          <label class="settings__radio" class:active={sttMode === 'auto'}>
            <input type="radio" name="stt_mode" value="auto" bind:group={sttMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.sttMode.auto.label')}</strong>
              <span class="settings__radio-desc">{t('settings.sttMode.auto.description')}</span>
            </div>
          </label>
        </div>

        {#if sttMode !== 'local'}
          <p class="settings__hint settings__hint--privacy">{t('settings.sttPrivacyNotice')}</p>
        {/if}
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.ocrhModeTitle')}</h2>
          <p>{currentOcrhModeDescription}</p>
        </div>

        <div class="settings__mode-options">
          <label class="settings__radio" class:active={ocrhMode === 'local'}>
            <input type="radio" name="ocrh_mode" value="local" bind:group={ocrhMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.ocrhMode.local.label')}</strong>
              <span class="settings__radio-desc">{t('settings.ocrhMode.local.description')}</span>
            </div>
          </label>

          <label class="settings__radio" class:active={ocrhMode === 'glm_ocr'}>
            <input type="radio" name="ocrh_mode" value="glm_ocr" bind:group={ocrhMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.ocrhMode.glm_ocr.label')}</strong>
              <span class="settings__radio-desc">
                {t('settings.ocrhMode.glm_ocr.description')}
              </span>
            </div>
          </label>

          <label class="settings__radio" class:active={ocrhMode === 'auto'}>
            <input type="radio" name="ocrh_mode" value="auto" bind:group={ocrhMode} />
            <div class="settings__radio-content">
              <strong>{t('settings.ocrhMode.auto.label')}</strong>
              <span class="settings__radio-desc">{t('settings.ocrhMode.auto.description')}</span>
            </div>
          </label>
        </div>

        {#if ocrhMode !== 'local'}
          <p class="settings__hint settings__hint--privacy">{t('settings.ocrhPrivacyNotice')}</p>
        {/if}
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.localModel.title')}</h2>
          <p>{t('settings.localModel.description')}</p>
        </div>

        {#if localModel}
          <div class="settings__local-model">
            <div class="settings__local-model-row">
              <span class="settings__label">{t('settings.localModel.status')}</span>
              {#if localModel.exists}
                <span class="settings__badge settings__badge--ok">{t('settings.localModel.found')}</span>
                <span class="settings__local-model-size">{formatBytes(localModel.size_bytes)}</span>
              {:else if localModel.can_auto_download}
                <span class="settings__badge settings__badge--warn">{t('settings.localModel.downloadable')}</span>
              {:else}
                <span class="settings__badge settings__badge--warn">{t('settings.localModel.missing')}</span>
              {/if}
            </div>

            <div class="settings__local-model-row">
              <span class="settings__label">{t('settings.localModel.path')}</span>
              <code class="settings__local-model-path">{localModel.path}</code>
            </div>

            {#if !localModel.exists}
              <p class="settings__local-model-guide">
                {t('settings.localModel.guide')}
                <code>{localModel.filename}</code>
              </p>

              <div class="settings__field settings__field--stacked">
                <label class="settings__label" for="local-model-filename">{t('settings.localModel.filename')}</label>
                <input
                  id="local-model-filename"
                  type="text"
                  class="settings__input"
                  bind:value={localModelFilename}
                  placeholder={localModel?.filename ?? ''}
                />
              </div>

              <div class="settings__field settings__field--stacked">
                <label class="settings__label" for="local-model-source">{t('settings.localModel.sourceUrl')}</label>
                <input
                  id="local-model-source"
                  type="text"
                  class="settings__input"
                  bind:value={localModelSourceUrl}
                  placeholder="https://…"
                />
              </div>

              {#if downloading}
                <div class="settings__download-progress">
                  <span class="settings__download-progress-bar" style="width: {downloadPct}%"></span>
                  <span class="settings__download-progress-text">{downloadPct}% — {t('settings.localModel.downloading')}</span>
                </div>
              {:else}
                <Button
                  variant="primary"
                  size="sm"
                  onclick={handleDownloadModel}
                  disabled={!localModelSourceUrl.trim()}
                >
                  {t('settings.localModel.download')}
                </Button>
              {/if}

              {#if downloadError}
                <p class="surface-message surface-message--error">{downloadError}</p>
              {/if}
            {/if}

            <Button variant="secondary" size="sm" onclick={() => llmOpenModelsDir()}>
              {t('settings.localModel.openFolder')}
            </Button>
          </div>
        {:else}
          <p class="settings__hint">Cargando estado del modelo local…</p>

        {/if}
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.openrouter.title')}</h2>
          <p>{t('settings.openrouter.description')}</p>
        </div>

        <div class="settings__field settings__field--stacked">
          <label class="settings__label" for="api-key">{t('settings.apiKey')}</label>
          <div class="settings__input-row">
            {#if showApiKey}
              <input
                id="api-key"
                type="text"
                class="settings__input"
                bind:value={apiKey}
                placeholder={t('settings.apiKeyPlaceholder')}
              />
            {:else}
              <input
                id="api-key"
                type="password"
                class="settings__input"
                bind:value={apiKey}
                placeholder={t('settings.apiKeyPlaceholder')}
              />
            {/if}
            <button
              class="settings__icon-btn"
              type="button"
              onclick={() => (showApiKey = !showApiKey)}
              title={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
              aria-label={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
            >
              {showApiKey ? '🙈' : '👁'}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onclick={handleTestConnection}
              disabled={testing || !apiKey.trim()}
            >
              {testing ? t('settings.testingConnection') : t('settings.testConnection')}
            </Button>
          </div>

          {#if maskedApiKey}
            <p class="settings__hint">{t('settings.loadedKey', { key: maskedApiKey })}</p>
          {/if}

          {#if testResult}
            <p
              class="surface-message settings__feedback"
              class:surface-message--success={testResult.success}
              class:surface-message--error={!testResult.success}
            >
              {testResult.message}
            </p>
          {/if}
        </div>

        <div class="settings__field settings__field--stacked">
          <Input
            label={t('settings.model')}
            type="text"
            bind:value={model}
            placeholder={t('settings.modelPlaceholder')}
          />

          {#if availableModels.length > 0}
            <div class="settings__model-list">
              <p class="settings__model-list-title">{t('settings.suggestedModels')}</p>
              {#each availableModels
                .filter((m) => m.id.includes('gemma') || m.id.includes('llama') || m.id.includes('mistral') || m.id.includes('qwen') || m.id.includes('claude') || m.id.includes('gpt'))
                .slice(0, 15) as m (m.id)}
                <button
                  class="settings__model-option"
                  type="button"
                  class:selected={model === m.id}
                  onclick={() => handleModelSelect(m.id)}
                >
                  <span class="settings__model-id">{m.id}</span>
                  <span class="settings__model-ctx">{Math.round(m.context_length / 1024)}k ctx</span
                  >
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.assemblyai.title')}</h2>
          <p>{t('settings.assemblyai.description')}</p>
        </div>

        <div class="settings__field settings__field--stacked">
          <label class="settings__label" for="assemblyai-api-key">{t('settings.apiKey')}</label>
          <div class="settings__input-row">
            <input
              id="assemblyai-api-key"
              type={showAssemblyAiApiKey ? 'text' : 'password'}
              class="settings__input"
              bind:value={assemblyAiApiKey}
              placeholder={t('settings.assemblyAiApiKeyPlaceholder')}
            />
            <button
              class="settings__icon-btn"
              type="button"
              onclick={() => (showAssemblyAiApiKey = !showAssemblyAiApiKey)}
              title={showAssemblyAiApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
              aria-label={showAssemblyAiApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
            >
              {showAssemblyAiApiKey ? '🙈' : '👁'}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onclick={handleTestAssemblyAiConnection}
              disabled={testingAssemblyAi || !assemblyAiApiKey.trim()}
            >
              {testingAssemblyAi ? t('settings.testingConnection') : t('settings.testConnection')}
            </Button>
          </div>

          {#if maskedAssemblyAiApiKey}
            <p class="settings__hint">{t('settings.loadedKey', { key: maskedAssemblyAiApiKey })}</p>
          {/if}

          {#if assemblyAiTestResult}
            <p
              class="surface-message settings__feedback"
              class:surface-message--success={assemblyAiTestResult.success}
              class:surface-message--error={!assemblyAiTestResult.success}
            >
              {assemblyAiTestResult.message}
            </p>
          {/if}
        </div>
      </section>
    </Card>

    <Card>
      <section class="settings-card-section">
        <div class="settings-card-section__copy">
          <h2>{t('settings.glmOcr.title')}</h2>
          <p>{t('settings.glmOcr.description')}</p>
        </div>

        <div class="settings__field settings__field--stacked">
          <label class="settings__label" for="glm-ocr-api-key">{t('settings.apiKey')}</label>
          <div class="settings__input-row">
            <input
              id="glm-ocr-api-key"
              type={showGlmOcrApiKey ? 'text' : 'password'}
              class="settings__input"
              bind:value={glmOcrApiKey}
              placeholder={t('settings.glmOcrApiKeyPlaceholder')}
            />
            <button
              class="settings__icon-btn"
              type="button"
              onclick={() => (showGlmOcrApiKey = !showGlmOcrApiKey)}
              title={showGlmOcrApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
              aria-label={showGlmOcrApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
            >
              {showGlmOcrApiKey ? '🙈' : '👁'}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onclick={handleTestGlmOcrConnection}
              disabled={testingGlmOcr || !glmOcrApiKey.trim()}
            >
              {testingGlmOcr ? t('settings.testingConnection') : t('settings.testConnection')}
            </Button>
          </div>

          {#if maskedGlmOcrApiKey}
            <p class="settings__hint">{t('settings.loadedKey', { key: maskedGlmOcrApiKey })}</p>
          {/if}

          {#if glmOcrTestResult}
            <p
              class="surface-message settings__feedback"
              class:surface-message--success={glmOcrTestResult.success}
              class:surface-message--error={!glmOcrTestResult.success}
            >
              {glmOcrTestResult.message}
            </p>
          {/if}
        </div>
      </section>
    </Card>

    {:else if activeTab === 'dependencias'}
    <DependenciasTab />
    {:else if activeTab === 'logs'}
    <LogsTab />
    {/if}
  </div>
{/key}

<style>
  .settings-view {
    min-height: 100%;
  }

  /* Tab navigation */
  .settings-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border-subtle);
    margin-bottom: var(--space-1);
  }

  .settings-tab {
    padding: var(--space-2) var(--space-5);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
    margin-bottom: -1px;
  }

  .settings-tab:hover {
    color: var(--color-text-primary);
  }

  .settings-tab--active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  .settings-tab__badge {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-warning);
    margin-left: var(--space-1);
    vertical-align: middle;
    animation: tab-badge-pulse 2s ease-in-out 3;
  }

  @keyframes tab-badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 transparent; }
    50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-warning) 25%, transparent); }
  }

  .settings-view__toolbar {
    justify-content: flex-end;
    flex: 1;
    align-self: center;
  }

  .settings-view__header {
    border-color: color-mix(in srgb, var(--color-success) 18%, var(--color-hairline));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--color-success-soft) 62%, transparent), transparent 70%),
      color-mix(in srgb, var(--color-surface-glass) 72%, transparent);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }

  .settings-view__header .page-header__eyebrow {
    color: color-mix(in srgb, var(--color-success) 78%, white 22%);
  }

  .settings-view__header .page-header__meta {
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .settings-view :global(.card) {
    border-color: color-mix(in srgb, var(--color-success) 14%, var(--color-hairline));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--color-success-soft) 34%, transparent), transparent 72%),
      color-mix(in srgb, var(--color-surface-glass) 74%, transparent);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }

  .settings-view :global(.card__header),
  .settings-view :global(.card__footer) {
    background-color: color-mix(in srgb, var(--color-surface-glass) 70%, transparent);
    border-color: color-mix(in srgb, var(--color-success) 12%, var(--color-hairline));
  }

  .settings-view :global(.card__body) {
    background: transparent;
  }

  .settings-card-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .settings-card-section__copy {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .settings-card-section__copy h2 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    letter-spacing: -0.01em;
  }

  .settings-card-section__copy p,
  .settings__hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  .settings__mode-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .settings__radio {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid color-mix(in srgb, var(--color-hairline) 78%, transparent);
    border-radius: var(--radius-md);
    cursor: pointer;
    background: color-mix(in srgb, var(--color-surface-glass) 76%, transparent);
    transition:
      border-color var(--transition-smooth),
      background-color var(--transition-smooth),
      box-shadow var(--transition-smooth),
      transform var(--transition-smooth);
  }

  .settings__radio:hover {
    border-color: color-mix(in srgb, var(--color-accent) 18%, var(--color-hairline));
    background: color-mix(in srgb, var(--color-surface-glass) 86%, transparent);
    transform: translateY(-1px);
  }

  .settings__radio.active {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-glass));
    box-shadow: var(--shadow-sm);
  }

  .settings__radio input[type='radio'] {
    margin-top: 3px;
    accent-color: var(--color-accent);
  }

  .settings__radio-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .settings__radio-content strong {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .settings__radio-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .settings__badge {
    display: inline-block;
    margin-left: var(--space-2);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: var(--font-weight-medium);
    vertical-align: middle;
  }
  .settings__badge--ok {
    background: var(--color-success-soft);
    color: var(--color-success);
  }
  .settings__badge--warn {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  .settings__field {
    margin-bottom: var(--space-1);
  }

  .settings__field--stacked {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .settings__label {
    display: block;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: color-mix(in srgb, var(--color-text-secondary) 86%, white 14%);
    margin-bottom: var(--space-1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .settings__input-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .settings__input {
    flex: 1;
    min-height: var(--control-height-md);
    padding: 0 var(--space-3);
    border: 1px solid color-mix(in srgb, var(--color-hairline) 78%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-glass) 78%, transparent);
    color: var(--color-text-primary);
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-sm);
  }

  .settings__input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: var(--focus-ring);
    background: color-mix(in srgb, var(--color-surface-glass) 88%, transparent);
  }

  .settings__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-md);
    height: var(--control-height-md);
    border: 1px solid color-mix(in srgb, var(--color-hairline) 78%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-glass) 78%, transparent);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 14px;
  }

  .settings__icon-btn:hover {
    border-color: color-mix(in srgb, var(--color-accent) 18%, var(--color-hairline));
    background: color-mix(in srgb, var(--color-surface-glass) 88%, transparent);
  }

  .settings-view :global(.input-field__input) {
    border-color: color-mix(in srgb, var(--color-hairline) 78%, transparent);
    background-color: color-mix(in srgb, var(--color-surface-glass) 78%, transparent);
  }

  .settings-view :global(.input-field__input:focus),
  .settings-view :global(.input-field__input:focus-visible) {
    background-color: color-mix(in srgb, var(--color-surface-glass) 88%, transparent);
  }

  .settings-view :global(.btn--secondary) {
    border-color: color-mix(in srgb, var(--color-hairline) 78%, transparent);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 55%),
      color-mix(in srgb, var(--color-surface-glass) 78%, transparent);
    box-shadow: none;
  }

  .settings-view :global(.btn--secondary:hover:not(:disabled)) {
    border-color: color-mix(in srgb, var(--color-accent) 18%, var(--color-hairline));
    background-color: color-mix(in srgb, var(--color-surface-glass) 88%, transparent);
  }

  .settings__feedback {
    margin: 0;
    line-height: 1.55;
  }

  .settings__hint--privacy {
    margin: 0;
    padding: var(--space-3);
    border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface-glass));
  }

  .settings__model-list {
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--color-hairline) 78%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-glass) 72%, transparent);
  }

  .settings__model-list-title {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    border-bottom: 1px solid color-mix(in srgb, var(--color-hairline) 72%, transparent);
  }
  .settings__model-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    text-align: left;
    transition: background-color var(--transition-smooth);
  }
  .settings__model-option:hover {
    background: color-mix(in srgb, var(--color-surface-glass) 82%, transparent);
  }

  .settings__model-option.selected {
    background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-glass));
    font-weight: var(--font-weight-medium);
  }

  .settings__model-option + .settings__model-option {
    border-top: 1px solid var(--color-border-subtle);
  }

  .settings__model-id {
    color: var(--color-text-primary);
  }

  .settings__model-ctx {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .settings__local-model {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .settings__local-model-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .settings__local-model-path {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
    background: var(--color-surface-sunken);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    word-break: break-all;
  }

  .settings__local-model-size {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono, monospace);
  }

  .settings__local-model-guide {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .settings__local-model-guide code {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface-sunken);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
  }

  .settings__download-progress {
    position: relative;
    height: 24px;
    background: var(--color-surface-sunken);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .settings__download-progress-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: var(--color-accent);
    opacity: 0.25;
    transition: width 0.2s ease;
  }

  .settings__download-progress-text {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    z-index: 1;
  }

  @media (max-width: 720px) {
    .settings-view__toolbar,
    .settings__input-row {
      width: 100%;
    }

    .settings-view__toolbar :global(.btn),
    .settings__input-row :global(.btn) {
      width: 100%;
    }

    .settings__icon-btn {
      flex: 0 0 auto;
    }
  }
</style>
