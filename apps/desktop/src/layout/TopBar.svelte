<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { navigation } from '$lib/navigation'
  import { getStore } from '$lib/db'
  import { locale, t } from '$lib/i18n'
  import { isCriticalMissing, onCriticalMissingChange } from '$lib/deps'
  import { Button } from '@entropia/ui'
  import type { Collection, Item } from '@entropia/store'

  let hasDepsWarning = $state(isCriticalMissing())
  const unsubDeps = onCriticalMissingChange((v) => { hasDepsWarning = v })

  type AppTheme = 'dark' | 'dim' | 'light'

  const THEME_STORAGE_KEY = 'entropia-theme'

  interface SearchResult {
    item: Item
    collection: Collection
  }

  let searchQuery = $state('')
  let searchResults = $state<SearchResult[]>([])
  let showResults = $state(false)
  let searching = $state(false)
  let previousItem = $state<Item | null>(null)
  let nextItem = $state<Item | null>(null)
  let theme = $state<AppTheme>('dark')
  let siblingRequestId = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let searchInputEl: HTMLInputElement | undefined = $state()
  const currentLocale = locale
  const translate = (key: string, params?: Record<string, string | number>) =>
    t(key as never, params)
  const THEME_CYCLE: AppTheme[] = ['dark', 'dim', 'light']
  const themeLabels: Record<AppTheme, string> = {
    dark: 'Oscuro',
    dim: 'Cálido',
    light: 'Claro',
  }
  const themeToggleLabel = $derived(themeLabels[theme])

  function readPersistedTheme(): AppTheme {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dim' || stored === 'light') return stored
      return 'dark'
    } catch {
      return 'dark'
    }
  }

  function applyTheme(nextTheme: AppTheme) {
    theme = nextTheme

    if (typeof document !== 'undefined') {
      if (nextTheme === 'dark') {
        delete document.documentElement.dataset.theme
      } else {
        document.documentElement.dataset.theme = nextTheme
      }
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {}
  }

  function toggleTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    const nextTheme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length] ?? 'dark'
    applyTheme(nextTheme)
  }

  onMount(() => {
    applyTheme(readPersistedTheme())
  })

  onDestroy(() => {
    unsubDeps()
  })

  function buildItemView(item: Item) {
    const currentView = $navigation.current
    if (currentView.name !== 'item') return null

    return {
      name: 'item' as const,
      collectionId: currentView.collectionId,
      collectionName: currentView.collectionName,
      itemId: item.id,
      itemTitle: item.title,
    }
  }

  async function loadSiblingItems() {
    const currentView = $navigation.current
    const requestId = ++siblingRequestId

    previousItem = null
    nextItem = null

    if (currentView.name !== 'item') return

    try {
      const items = await getStore().items.findByCollection(currentView.collectionId)
      if (requestId !== siblingRequestId) return

      const currentIndex = items.findIndex((item) => item.id === currentView.itemId)
      if (currentIndex === -1) return

      previousItem = items[currentIndex - 1] ?? null
      nextItem = items[currentIndex + 1] ?? null
    } catch (error) {
      if (requestId !== siblingRequestId) return
      console.error('[TopBar] Failed to load sibling documents', error)
    }
  }

  function navigateToSibling(item: Item | null) {
    const nextView = item ? buildItemView(item) : null
    if (!nextView) return
    navigation.replace(nextView)
  }

  $effect(() => {
    $navigation.current
    void loadSiblingItems()
  })

  async function performSearch(query: string) {
    if (!query.trim()) {
      searchResults = []
      showResults = false
      return
    }

    searching = true
    try {
      const store = getStore()
      const matchedItems = await store.items.searchGlobal(query, 20)
      const results: SearchResult[] = []

      // Cache collections to avoid repeated lookups
      const collectionCache = new Map<string, Collection>()
      for (const item of matchedItems) {
        let collection = collectionCache.get(item.collectionId)
        if (!collection) {
          const found = await store.collections.findById(item.collectionId)
          if (!found) continue
          collection = found
          collectionCache.set(item.collectionId, collection)
        }
        results.push({ item, collection })
      }

      searchResults = results
      showResults = true
    } catch (e) {
      console.error('[Search] error:', e)
      searchResults = []
    } finally {
      searching = false
    }
  }

  function handleInput() {
    if (debounceTimer) clearTimeout(debounceTimer)
  }

  function handleSearchValueChange(query: string, e: Event) {
    searchQuery = query
    handleInput()

    if (!searchQuery.trim()) {
      searchResults = []
      showResults = false
      return
    }

    debounceTimer = setTimeout(() => {
      performSearch(searchQuery)
    }, 300)
  }

  function handleClear() {
    searchQuery = ''
    searchResults = []
    showResults = false
    if (debounceTimer) clearTimeout(debounceTimer)
  }

  function handleResultClick(result: SearchResult) {
    navigation.navigate({
      name: 'collection',
      id: result.collection.id,
      collectionName: result.collection.name,
    })
    navigation.navigate({
      name: 'item',
      collectionId: result.collection.id,
      collectionName: result.collection.name,
      itemId: result.item.id,
      itemTitle: result.item.title,
    })
    handleClear()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClear()
      searchInputEl?.blur()
    }
  }

  function handleBlur() {
    setTimeout(() => {
      showResults = false
    }, 200)
  }

  function handleFocus() {
    if (searchResults.length > 0) {
      showResults = true
    }
  }
</script>

<header class="topbar">
  <div class="topbar__leading">
    <div class="topbar__back-slot">
      {#if $navigation.canGoBack}
        <Button variant="ghost" size="sm" onclick={() => navigation.back()}
          >{$currentLocale && t('topbar.back')}</Button
        >
      {/if}
    </div>
    <nav class="breadcrumb" aria-label={$currentLocale && t('topbar.breadcrumb')}>
      {#each $navigation.breadcrumb as crumb, i}
        {#if i > 0}<span class="sep">/</span>{/if}
        {#if i === $navigation.breadcrumb.length - 1}
          <span class="crumb crumb--current" class:last={i === $navigation.breadcrumb.length - 1}>
            <span class="crumb__label">{crumb}</span>
          </span>
        {:else}
          <span class="crumb">{crumb}</span>
        {/if}
      {/each}
    </nav>
  </div>

  <div class="topbar__center" class:topbar__center--inactive={$navigation.current.name !== 'item'}>
    {#if $navigation.current.name === 'item'}
      <span class="crumb-nav" aria-label={$currentLocale && t('topbar.breadcrumb')}>
        <button
          class="crumb-nav__button"
          type="button"
          aria-label={$currentLocale && t('topbar.previousDocument')}
          title={$currentLocale && t('topbar.previousDocument')}
          disabled={!previousItem}
          onclick={() => navigateToSibling(previousItem)}
        >
          &lt;
        </button>
        <span class="crumb-nav__separator" aria-hidden="true">|</span>
        <button
          class="crumb-nav__button"
          type="button"
          aria-label={$currentLocale && t('topbar.nextDocument')}
          title={$currentLocale && t('topbar.nextDocument')}
          disabled={!nextItem}
          onclick={() => navigateToSibling(nextItem)}
        >
          &gt;
        </button>
      </span>
    {/if}
  </div>

  <div class="global-search">
    <div class="global-search__input-wrap">
      <input
        class="global-search__input"
        type="search"
        bind:value={searchQuery}
        bind:this={searchInputEl}
        placeholder={$currentLocale && translate('topbar.searchPlaceholder')}
        aria-label={$currentLocale && translate('topbar.searchAria')}
        oninput={(event: Event) =>
          handleSearchValueChange((event.currentTarget as HTMLInputElement).value, event)}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        onfocus={handleFocus}
      />

      {#if searchQuery}
        <button
          class="global-search__clear"
          type="button"
          aria-label={$currentLocale && translate('topbar.searchClear')}
          title={$currentLocale && translate('topbar.searchClear')}
          onclick={handleClear}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path d="M5 5l10 10M15 5L5 15" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      {/if}
    </div>

    {#if showResults}
      <div class="global-search__dropdown">
        {#if searching}
          <div class="global-search__status">
            {$currentLocale && translate('topbar.searchSearching')}
          </div>
        {:else if searchResults.length === 0}
          <div class="global-search__status">
            {$currentLocale && translate('topbar.searchNoResults', { query: searchQuery })}
          </div>
        {:else}
          {#each searchResults as result (result.item.id)}
            <button
              class="global-search__result"
              type="button"
              onclick={() => handleResultClick(result)}
            >
              <span class="global-search__result-title">{result.item.title}</span>
              <span class="global-search__result-collection">{result.collection.name}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="topbar__actions">
    <button
      class="topbar__icon-btn"
      type="button"
      onclick={() => navigation.openRootSection({ name: 'db-browser' })}
      title={$currentLocale && translate('topbar.dbBrowserTitle')}
      aria-label={$currentLocale && translate('topbar.dbBrowserAria')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <ellipse cx="12" cy="5" rx="7" ry="3" stroke-width="1.8" />
        <path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" stroke-width="1.8" />
        <path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" stroke-width="1.8" />
      </svg>
    </button>

    <button
      class="topbar__icon-btn"
      type="button"
      onclick={toggleTheme}
      title={$currentLocale && themeToggleLabel}
      aria-label={$currentLocale && themeToggleLabel}
      aria-pressed={theme === 'dim'}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8" stroke-width="1.7" />
        <path
          d="M12 4a8 8 0 0 1 0 16c2.2-1.7 3.2-4.2 3.2-8S14.2 5.7 12 4z"
          fill="currentColor"
          opacity="0.42"
          stroke="none"
        />
      </svg>
    </button>

    <button
      class="topbar__icon-btn topbar__icon-btn--settings"
      type="button"
      onclick={() => navigation.openRootSection({ name: 'settings' })}
      title={hasDepsWarning
        ? 'Dependencias de IA pendientes — click para configurar'
        : ($currentLocale && t('topbar.settingsTitle'))}
      aria-label={hasDepsWarning
        ? 'Dependencias de IA pendientes'
        : ($currentLocale && t('topbar.settingsAria'))}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
          clip-rule="evenodd"
        />
      </svg>
      {#if hasDepsWarning}
        <span class="topbar__badge" aria-label="Dependencias pendientes"></span>
      {/if}
    </button>
  </div>
</header>

<style>
  .topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(220px, 320px) auto;
    grid-template-areas: 'leading center search actions';
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-surface);
    min-width: 0;
  }

  .topbar__leading {
    grid-area: leading;
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .topbar__back-slot {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .topbar__center {
    grid-area: center;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 56px;
  }

  .topbar__center--inactive {
    visibility: hidden;
    pointer-events: none;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .crumb {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb--current {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .crumb__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb.last {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
  }
  .sep {
    color: var(--color-text-muted);
  }

  .crumb-nav {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
  }

  .crumb-nav__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    transition:
      color var(--transition-base),
      background-color var(--transition-base);
  }

  .crumb-nav__button:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  }

  .crumb-nav__button:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .crumb-nav__button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .crumb-nav__separator {
    font-size: 10px;
    opacity: 0.55;
  }

  .topbar__actions {
    grid-area: actions;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .topbar__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    padding: 0;
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      color var(--transition-base),
      background-color var(--transition-base),
      border-color var(--transition-base),
      box-shadow var(--transition-base);
  }
  .topbar__icon-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-surface-elevated);
    border-color: var(--color-border-strong);
  }
  .topbar__icon-btn[aria-pressed='true'] {
    color: var(--color-accent-hover);
    background: var(--color-accent-faint);
    border-color: var(--color-border-strong);
  }
  .topbar__icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .topbar__icon-btn--settings {
    position: relative;
  }

  .topbar__badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-warning);
    border: 1.5px solid var(--color-surface);
    pointer-events: none;
    animation: badge-pulse 2s ease-in-out 3;
  }

  @keyframes badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 transparent; }
    50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-warning) 30%, transparent); }
  }

  .global-search {
    grid-area: search;
    justify-self: end;
    position: relative;
    width: min(100%, 320px);
    min-width: 0;
  }

  .global-search__input-wrap {
    position: relative;
  }

  .global-search__input {
    width: 100%;
    min-height: var(--control-height-md);
    padding: 0 calc(var(--space-4) + 18px) 0 var(--space-3);
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .global-search__input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: var(--focus-ring);
    background: var(--color-surface);
  }

  .global-search__clear {
    position: absolute;
    top: 50%;
    right: var(--space-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transform: translateY(-50%);
  }

  .global-search__clear:hover {
    color: var(--color-text-primary);
    background: var(--color-surface-raised);
  }

  .global-search__clear:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .global-search__result:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .global-search__dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: var(--space-1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.012)),
      var(--color-surface-elevated);
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.15));
    max-height: 320px;
    overflow-y: auto;
    z-index: 200;
  }

  .global-search__status {
    padding: var(--space-3);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .global-search__result {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-3);
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-sans);
    transition:
      background-color var(--transition-base),
      box-shadow var(--transition-base);
  }

  .global-search__result:hover {
    background-color: var(--color-surface-raised);
  }

  .global-search__result + .global-search__result {
    border-top: 1px solid var(--color-border-subtle);
  }

  .global-search__result-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .global-search__result-collection {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  @media (max-width: 900px) {
    .topbar {
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas:
        'leading center actions'
        'search search search';
    }

    .topbar__leading {
      grid-area: leading;
    }

    .topbar__center {
      grid-area: center;
    }

    .topbar__actions {
      grid-area: actions;
    }

    .global-search {
      grid-area: search;
      width: 100%;
    }
  }
</style>
