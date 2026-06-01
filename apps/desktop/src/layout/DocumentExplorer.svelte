<script lang="ts">
  import { onMount } from 'svelte'
  import { getStore } from '$lib/db'
  import { locale, t, type I18nKey } from '$lib/i18n'
  import { navigation, type View } from '$lib/navigation'
  import {
    DOCUMENT_EXPLORER_ASSET_SELECTED_EVENT,
    DOCUMENT_EXPLORER_ASSET_SELECT_REQUEST_EVENT,
    type DocumentExplorerAssetDetail,
  } from '$lib/document-explorer'
  import type { Asset, Collection, Item } from '@entropia/store'

  let { filterText = '' }: { filterText?: string } = $props()

  const STORAGE_KEY = 'entropia-document-explorer-open'
  const TREE_STORAGE_KEY = 'entropia-document-explorer-tree'
  const WIDTH_STORAGE_KEY = 'entropia-document-explorer-width'
  const DEFAULT_WIDTH = 244
  const MIN_WIDTH = 220
  const MAX_WIDTH = Math.round(DEFAULT_WIDTH * 1.1)
  const COLLAPSED_WIDTH = 36

  const pendingItemLoads = new Map<string, Promise<void>>()
  const pendingAssetLoads = new Map<string, Promise<void>>()

  let collectionsRequest: Promise<void> | null = null
  let isOpen = $state(true)
  let loading = $state(false)
  let loadError = $state<string | null>(null)
  let collections = $state<Collection[]>([])
  const filteredCollections = $derived(
    filterText
      ? collections.filter((c) => c.name.toLowerCase().includes(filterText.toLowerCase()))
      : collections,
  )
  let itemsByCollection = $state<Record<string, Item[]>>({})
  let assetsByItem = $state<Record<string, Asset[]>>({})
  let itemCounts = $state<Record<string, number>>({})
  let loadingCollections = $state<string[]>([])
  let loadingItems = $state<string[]>([])
  let openCollections = $state<string[]>([])
  let openItems = $state<string[]>([])
  let activeAssetId = $state<string | null>(null)
  let explorerWidth = $state(DEFAULT_WIDTH)
  const currentLocale = locale
  const translateExplorer = (key: string) => t(key as I18nKey)

  function readPersistedOpenState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') return true
      if (stored === 'false') return false
    } catch {}

    return true
  }

  function persistOpenState(value: boolean) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {}
  }


  function clampExplorerWidth(value: number) {
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
  }

  function readPersistedWidth() {
    try {
      const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
      if (Number.isFinite(stored)) return clampExplorerWidth(stored)
    } catch {}

    return DEFAULT_WIDTH
  }

  function persistExplorerWidth(value: number) {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(clampExplorerWidth(value)))
    } catch {}
  }

  function startResize(event: PointerEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = explorerWidth

    const handleMove = (moveEvent: PointerEvent) => {
      explorerWidth = clampExplorerWidth(startWidth + moveEvent.clientX - startX)
    }

    const handleUp = () => {
      persistExplorerWidth(explorerWidth)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
  }

  function uniqueIds(ids: string[]) {
    return [...new Set(ids)]
  }

  function readPersistedTreeState() {
    try {
      const stored = localStorage.getItem(TREE_STORAGE_KEY)
      if (!stored) {
        return { collections: [], items: [] }
      }

      const parsed = JSON.parse(stored) as {
        collections?: unknown
        items?: unknown
      }

      return {
        collections: Array.isArray(parsed.collections)
          ? parsed.collections.filter((entry): entry is string => typeof entry === 'string')
          : [],
        items: Array.isArray(parsed.items)
          ? parsed.items.filter((entry): entry is string => typeof entry === 'string')
          : [],
      }
    } catch {
      return { collections: [], items: [] }
    }
  }

  function persistTreeState(collectionIds: string[], itemIds: string[]) {
    try {
      localStorage.setItem(
        TREE_STORAGE_KEY,
        JSON.stringify({
          collections: uniqueIds(collectionIds),
          items: uniqueIds(itemIds),
        })
      )
    } catch {}
  }

  function commitTreeState(nextCollections: string[], nextItems: string[]) {
    openCollections = uniqueIds(nextCollections)
    openItems = uniqueIds(nextItems)
    persistTreeState(openCollections, openItems)
  }

  function getToggleLabel(kind: 'collection' | 'item', expanded: boolean, label: string) {
    const localeValue = $currentLocale

    if (localeValue === 'en') {
      return `${expanded ? 'Collapse' : 'Expand'} ${kind === 'collection' ? 'collection' : 'document'} ${label}`
    }

    return `${expanded ? 'Colapsar' : 'Expandir'} ${kind === 'collection' ? 'colección' : 'documento'} ${label}`
  }

  function toggleOpen() {
    isOpen = !isOpen
    persistOpenState(isOpen)
  }

  function getActiveCollectionId(view: View): string | null {
    if (view.name === 'collection') return view.id
    if (view.name === 'item') return view.collectionId
    return null
  }

  function getActiveItemId(view: View): string | null {
    return view.name === 'item' ? view.itemId : null
  }

  function getAssetLabel(asset: Asset, index: number): string {
    const fileName = asset.path.split(/[/\\]/).pop()?.trim()
    if (fileName) return fileName
    return `${asset.type.toUpperCase()} ${index + 1}`
  }

  function getAssetIcon(assetType: Asset['type']) {
    if (assetType === 'audio') return 'audio'
    if (assetType === 'pdf') return 'pdf'
    if (assetType === 'image') return 'image'
    return 'document'
  }

  function isCollectionExpanded(collectionId: string) {
    return collectionId === activeCollectionId || openCollections.includes(collectionId)
  }

  function isItemExpanded(itemId: string) {
    return itemId === activeItemId || openItems.includes(itemId)
  }

  function isCollectionLoading(collectionId: string) {
    return loadingCollections.includes(collectionId)
  }

  function isItemLoading(itemId: string) {
    return loadingItems.includes(itemId)
  }

  async function ensureCollectionsLoaded() {
    if (collections.length > 0) return
    if (collectionsRequest) {
      await collectionsRequest
      return
    }

    collectionsRequest = (async () => {
      loading = true
      loadError = null

      try {
        const store = getStore()
        const loadedCollections = await store.collections.findAll()
        const countEntries = await Promise.all(
          loadedCollections.map(async (collection) => {
            const count = await store.collections.countItems(collection.id)
            return [collection.id, count] as const
          })
        )

        collections = loadedCollections
        itemCounts = Object.fromEntries(countEntries)
      } catch (error) {
        loadError = error instanceof Error ? error.message : translateExplorer('explorer.loadError')
      } finally {
        loading = false
        collectionsRequest = null
      }
    })()

    await collectionsRequest
  }

  async function ensureCollectionItemsLoaded(collectionId: string) {
    if (itemsByCollection[collectionId]) return
    const pending = pendingItemLoads.get(collectionId)
    if (pending) {
      await pending
      return
    }

    const request = (async () => {
      loadingCollections = uniqueIds([...loadingCollections, collectionId])
      loadError = null

      try {
        const items = await getStore().items.findByCollection(collectionId)
        itemsByCollection = {
          ...itemsByCollection,
          [collectionId]: items,
        }
      } catch (error) {
        loadError = error instanceof Error ? error.message : translateExplorer('explorer.loadError')
      } finally {
        loadingCollections = loadingCollections.filter((entry) => entry !== collectionId)
        pendingItemLoads.delete(collectionId)
      }
    })()

    pendingItemLoads.set(collectionId, request)
    await request
  }

  async function ensureItemAssetsLoaded(itemId: string) {
    if (assetsByItem[itemId]) return
    const pending = pendingAssetLoads.get(itemId)
    if (pending) {
      await pending
      return
    }

    const request = (async () => {
      loadingItems = uniqueIds([...loadingItems, itemId])
      loadError = null

      try {
        const assets = await getStore().assets.findByItem(itemId)
        assetsByItem = {
          ...assetsByItem,
          [itemId]: assets,
        }
      } catch (error) {
        loadError = error instanceof Error ? error.message : translateExplorer('explorer.loadError')
      } finally {
        loadingItems = loadingItems.filter((entry) => entry !== itemId)
        pendingAssetLoads.delete(itemId)
      }
    })()

    pendingAssetLoads.set(itemId, request)
    await request
  }

  async function toggleCollectionExpanded(collection: Collection) {
    const expanded = isCollectionExpanded(collection.id)
    if (expanded && collection.id !== activeCollectionId) {
      const collectionItemIds = (itemsByCollection[collection.id] ?? []).map((item) => item.id)
      commitTreeState(
        openCollections.filter((entry) => entry !== collection.id),
        openItems.filter((itemId) => !collectionItemIds.includes(itemId))
      )
      return
    }

    commitTreeState([...openCollections, collection.id], openItems)
    await ensureCollectionItemsLoaded(collection.id)
  }

  async function toggleItemExpanded(item: Item) {
    const expanded = isItemExpanded(item.id)
    if (expanded && item.id !== activeItemId) {
      commitTreeState(
        [...openCollections, item.collectionId],
        openItems.filter((entry) => entry !== item.id)
      )
      return
    }

    commitTreeState([...openCollections, item.collectionId], [...openItems, item.id])
    await ensureItemAssetsLoaded(item.id)
  }

  function handleCollectionClick(collection: Collection) {
    const current = $navigation.current
    if (current.name === 'collection' && current.id === collection.id) return

    if (current.name === 'item' && current.collectionId === collection.id) {
      navigation.replace({
        name: 'collection',
        id: collection.id,
        collectionName: collection.name,
      })
      return
    }

    if (
      (current.name === 'collection' && current.id !== collection.id) ||
      (current.name === 'item' && current.collectionId !== collection.id)
    ) {
      navigation.resetToPath([
        { name: 'collections' },
        {
          name: 'collection',
          id: collection.id,
          collectionName: collection.name,
        },
      ])
      return
    }

    navigation.replace({
      name: 'collection',
      id: collection.id,
      collectionName: collection.name,
    })
  }

  function handleItemClick(item: Item) {
    const current = $navigation.current
    const collection = collections.find((entry) => entry.id === item.collectionId)
    const collectionName = collection?.name ?? ''
    const nextView = {
      name: 'item' as const,
      collectionId: item.collectionId,
      collectionName,
      itemId: item.id,
      itemTitle: item.title,
    }

    if (current.name === 'item' && current.itemId === item.id) return
    if (current.name === 'item' && current.collectionId === item.collectionId) {
      navigation.replace(nextView)
      return
    }

    if (
      (current.name === 'collection' && current.id !== item.collectionId) ||
      (current.name === 'item' && current.collectionId !== item.collectionId)
    ) {
      navigation.resetToPath([
        { name: 'collections' },
        {
          name: 'collection',
          id: item.collectionId,
          collectionName,
        },
        nextView,
      ])
      return
    }

    navigation.navigate(nextView)
  }

  function handleAssetClick(asset: Asset) {
    activeAssetId = asset.id
    window.dispatchEvent(
      new CustomEvent<DocumentExplorerAssetDetail>(DOCUMENT_EXPLORER_ASSET_SELECT_REQUEST_EVENT, {
        detail: {
          itemId: asset.itemId,
          assetId: asset.id,
        },
      })
    )
  }

  const activeCollectionId = $derived(getActiveCollectionId($navigation.current))
  const activeItemId = $derived(getActiveItemId($navigation.current))

  $effect(() => {
    const currentView = $navigation.current
    const nextActiveCollectionId = getActiveCollectionId(currentView)
    const nextActiveItemId = getActiveItemId(currentView)

    void ensureCollectionsLoaded()

    if (!nextActiveItemId) {
      activeAssetId = null
    }

    if (nextActiveCollectionId) {
      void ensureCollectionItemsLoaded(nextActiveCollectionId)
    }

    if (nextActiveItemId) {
      void ensureItemAssetsLoaded(nextActiveItemId)
    }
  })

  $effect(() => {
    collections
    for (const collectionId of openCollections) {
      void ensureCollectionItemsLoaded(collectionId)
    }
  })

  $effect(() => {
    itemsByCollection
    for (const itemId of openItems) {
      void ensureItemAssetsLoaded(itemId)
    }
  })

  onMount(() => {
    isOpen = readPersistedOpenState()
    explorerWidth = readPersistedWidth()
    const persistedTree = readPersistedTreeState()
    openCollections = persistedTree.collections
    openItems = persistedTree.items

    const handleAssetSelected = (event: Event) => {
      const detail = (event as CustomEvent<DocumentExplorerAssetDetail>).detail
      if (detail.itemId === activeItemId) {
        activeAssetId = detail.assetId
      }
    }

    window.addEventListener(DOCUMENT_EXPLORER_ASSET_SELECTED_EVENT, handleAssetSelected)

    return () => {
      window.removeEventListener(DOCUMENT_EXPLORER_ASSET_SELECTED_EVENT, handleAssetSelected)
    }
  })
</script>

<aside
  class="explorer"
  class:is-open={isOpen}
  class:is-collapsed={!isOpen}
  style:width={`${isOpen ? explorerWidth : COLLAPSED_WIDTH}px`}
  aria-label={$currentLocale && translateExplorer('explorer.aria')}
>
  <button
    type="button"
    class="explorer__rail-toggle"
    aria-label={$currentLocale && translateExplorer(isOpen ? 'explorer.collapse' : 'explorer.expand')}
    title={$currentLocale && translateExplorer(isOpen ? 'explorer.collapse' : 'explorer.expand')}
    onclick={toggleOpen}
  >
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={isOpen ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
    </svg>
  </button>

  {#if isOpen}
  <div id="document-explorer-panel" class="explorer__panel">
      <div id="document-explorer-content" class="explorer__scroll">
        {#if loadError}
          <p class="explorer__message explorer__message--error">{loadError}</p>
        {:else if loading}
          <p class="explorer__message">{$currentLocale && translateExplorer('explorer.loading')}</p>
        {:else if filteredCollections.length === 0}
          <p class="explorer__message">
            {filterText
              ? `Sin resultados para "${filterText}"`
              : ($currentLocale && translateExplorer('explorer.emptyCollections'))}
          </p>
        {:else}
          <section
            class="explorer__section"
            aria-label={$currentLocale && translateExplorer('explorer.collections')}
          >
            <div class="explorer__section-label">
              {$currentLocale && translateExplorer('explorer.collections')}
            </div>

            <div
              class="explorer__tree"
              role="tree"
              aria-label={$currentLocale && translateExplorer('explorer.aria')}
            >
              {#each filteredCollections as collection (collection.id)}
                {@const collectionExpanded = isCollectionExpanded(collection.id)}
                {@const collectionItems = itemsByCollection[collection.id] ?? []}
                <div
                  class="explorer__treeitem"
                  class:is-active={collection.id === activeCollectionId}
                  role="treeitem"
                  aria-level="1"
                  aria-expanded={collectionExpanded}
                  aria-selected={collection.id === activeCollectionId}
                  aria-current={collection.id === activeCollectionId ? 'true' : undefined}
                  aria-label={collection.name}
                >
                  <div class="explorer__row" style:--level="1">
                    <button
                      type="button"
                      class="explorer__chevron"
                      aria-label={getToggleLabel('collection', collectionExpanded, collection.name)}
                      aria-expanded={collectionExpanded}
                      onclick={() => toggleCollectionExpanded(collection)}
                    >
                      <svg
                        class:explorer__chevron-icon--open={collectionExpanded}
                        class="explorer__chevron-icon"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 3.5 4.5 4.5L6 12.5" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      class="explorer__node explorer__node--collection"
                      class:is-active={collection.id === activeCollectionId}
                      onclick={() => handleCollectionClick(collection)}
                    >
                      <span
                        class="explorer__node-icon explorer__node-icon--collection"
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path
                            d="M2.5 5.5h3l1.2-1.5h2.8c1.6 0 2.5.9 2.5 2.5v4.2c0 1.6-.9 2.5-2.5 2.5H4.7c-1.6 0-2.5-.9-2.5-2.5V5.5Z"
                          />
                          <path d="M2.5 6.2h10.5" opacity="0.65" />
                        </svg>
                      </span>
                      <span class="explorer__node-main">{collection.name}</span>
                      <span class="explorer__node-meta">{itemCounts[collection.id] ?? 0}</span>
                    </button>
                  </div>

                  {#if collectionExpanded}
                    <div class="explorer__group" role="group">
                      {#if isCollectionLoading(collection.id)}
                        <p class="explorer__message explorer__message--nested">
                          {$currentLocale && translateExplorer('explorer.loading')}
                        </p>
                      {:else if collectionItems.length === 0}
                        <p class="explorer__message explorer__message--nested">
                          {$currentLocale && translateExplorer('explorer.emptyDocuments')}
                        </p>
                      {:else}
                        {#each collectionItems as item (item.id)}
                          {@const itemExpanded = isItemExpanded(item.id)}
                          {@const itemAssets = assetsByItem[item.id] ?? []}
                          <div
                            class="explorer__treeitem"
                            class:is-active={item.id === activeItemId}
                            role="treeitem"
                            aria-level="2"
                            aria-expanded={itemExpanded}
                            aria-selected={item.id === activeItemId}
                            aria-current={item.id === activeItemId ? 'true' : undefined}
                            aria-label={item.title}
                          >
                            <div class="explorer__row" style:--level="2">
                              <button
                                type="button"
                                class="explorer__chevron"
                                aria-label={getToggleLabel('item', itemExpanded, item.title)}
                                aria-expanded={itemExpanded}
                                onclick={() => toggleItemExpanded(item)}
                              >
                                <svg
                                  class:explorer__chevron-icon--open={itemExpanded}
                                  class="explorer__chevron-icon"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="1.8"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="m6 3.5 4.5 4.5L6 12.5" />
                                </svg>
                              </button>

                              <button
                                type="button"
                                class="explorer__node explorer__node--item"
                                class:is-active={item.id === activeItemId}
                                onclick={() => handleItemClick(item)}
                              >
                                <span
                                  class="explorer__node-icon explorer__node-icon--item"
                                  aria-hidden="true"
                                >
                                  <svg
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.5"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <path
                                      d="M5 2.75h3.8l2.2 2.2v7.3c0 .83-.67 1.5-1.5 1.5h-4.5c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5Z"
                                    />
                                    <path d="M8.75 2.9V5.2h2.3" opacity="0.7" />
                                    <path d="M5.5 7.2h4.8M5.5 9.4h4.8" opacity="0.7" />
                                  </svg>
                                </span>
                                <span class="explorer__node-main">{item.title}</span>
                              </button>
                            </div>

                            {#if itemExpanded}
                              <div class="explorer__group" role="group">
                                {#if isItemLoading(item.id)}
                                  <p class="explorer__message explorer__message--nested">
                                    {$currentLocale && translateExplorer('explorer.loading')}
                                  </p>
                                {:else if itemAssets.length === 0}
                                  <p class="explorer__message explorer__message--nested">
                                    {$currentLocale && translateExplorer('explorer.emptyAssets')}
                                  </p>
                                {:else}
                                  {#each itemAssets as asset, index (asset.id)}
                                    {@const assetIcon = getAssetIcon(asset.type)}
                                    <div
                                      class="explorer__treeitem"
                                      role="treeitem"
                                      aria-level="3"
                                      aria-selected={asset.id === activeAssetId}
                                      aria-current={asset.id === activeAssetId ? 'true' : undefined}
                                      aria-label={getAssetLabel(asset, index)}
                                    >
                                      <div class="explorer__row" style:--level="3">
                                        <span
                                          class="explorer__chevron explorer__chevron--placeholder"
                                          aria-hidden="true"
                                        ></span>
                                        <button
                                          type="button"
                                          class="explorer__node explorer__node--asset"
                                          class:is-active={asset.id === activeAssetId}
                                          onclick={() => handleAssetClick(asset)}
                                        >
                                          <span
                                            class="explorer__node-icon explorer__node-icon--asset"
                                            aria-hidden="true"
                                          >
                                            <svg
                                              viewBox="0 0 16 16"
                                              fill="none"
                                              stroke="currentColor"
                                              stroke-width="1.5"
                                              stroke-linecap="round"
                                              stroke-linejoin="round"
                                            >
                                              {#if assetIcon === 'audio'}
                                                <path
                                                  d="M3.75 9.75h2.1l2.65 2V4.25l-2.65 2h-2.1Z"
                                                />
                                                <path
                                                  d="M10.5 6.2a2.7 2.7 0 0 1 0 3.6"
                                                  opacity="0.82"
                                                />
                                                <path
                                                  d="M11.9 4.75a4.7 4.7 0 0 1 0 6.5"
                                                  opacity="0.58"
                                                />
                                              {:else if assetIcon === 'pdf'}
                                                <path
                                                  d="M4.75 2.75h4.2l2.3 2.3v7.2c0 .83-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5Z"
                                                />
                                                <path d="M8.85 2.95v2.2h2.2" opacity="0.7" />
                                                <path d="M5.1 10.9h5.8" opacity="0.7" />
                                                <path
                                                  d="M5.2 8.8h1.1c.6 0 .95-.32.95-.84 0-.52-.35-.84-.95-.84H5.2Zm2.9 1.96V7.12h1c.9 0 1.48.68 1.48 1.82s-.58 1.82-1.48 1.82Zm3.22 0V7.12h2"
                                                />
                                              {:else if assetIcon === 'image'}
                                                <rect
                                                  x="3"
                                                  y="3.25"
                                                  width="10"
                                                  height="9.5"
                                                  rx="1.5"
                                                />
                                                <circle cx="6.1" cy="6.2" r="1" />
                                                <path
                                                  d="m4.2 11 2.35-2.35a1 1 0 0 1 1.4 0l1.2 1.2 1.05-.95a1 1 0 0 1 1.35.04L13 10.45"
                                                />
                                              {:else}
                                                <path
                                                  d="M5 2.75h3.8l2.2 2.2v7.3c0 .83-.67 1.5-1.5 1.5h-4.5c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5Z"
                                                />
                                                <path d="M8.75 2.9V5.2h2.3" opacity="0.7" />
                                                <path d="M5.5 8h4.8M5.5 10.2h4.8" opacity="0.7" />
                                              {/if}
                                            </svg>
                                          </span>
                                          <span class="explorer__node-main"
                                            >{getAssetLabel(asset, index)}</span
                                          >
                                          <span class="explorer__asset-type">{asset.type}</span>
                                        </button>
                                      </div>
                                    </div>
                                  {/each}
                                {/if}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>

      <div
        class="explorer__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={$currentLocale && translateExplorer('explorer.resize')}
        title={$currentLocale && translateExplorer('explorer.resize')}
        onpointerdown={startResize}
      ></div>
  </div>
  {/if}
</aside>

<style>
  .explorer {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    min-width: 180px;
    max-width: 300px;
    border-right: 1px solid var(--color-border-subtle);
    background: var(--color-surface);
    overflow: hidden;
    font-size: 12px;
  }

  .explorer.is-collapsed {
    width: 36px;
    min-width: 36px;
    max-width: 36px;
  }

  .explorer__rail-toggle {
    position: absolute;
    top: 6px;
    right: 5px;
    z-index: 6;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--color-border-subtle);
    border-radius: 7px;
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      color var(--transition-base),
      background-color var(--transition-base),
      border-color var(--transition-base);
  }

  .explorer__rail-toggle:hover {
    border-color: color-mix(in srgb, var(--color-accent) 44%, transparent);
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    color: var(--color-text);
  }

  .explorer__rail-toggle:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-accent) 70%, transparent);
    outline-offset: 2px;
  }

  .explorer__rail-toggle svg {
    width: 14px;
    height: 14px;
  }

  .explorer__panel {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .explorer__resize-handle {
    position: absolute;
    top: 0;
    right: -3px;
    bottom: 0;
    z-index: 4;
    width: 7px;
    cursor: col-resize;
  }

  .explorer__resize-handle::after {
    content: '';
    position: absolute;
    top: 48px;
    right: 3px;
    bottom: 8px;
    width: 1px;
    border-radius: 999px;
    background: transparent;
    transition: background-color var(--transition-base);
  }

  .explorer__resize-handle:hover::after {
    background: color-mix(in srgb, var(--color-accent) 44%, transparent);
  }

  .explorer__resize-handle:focus-visible {
    outline: none;
  }

  .explorer__resize-handle:focus-visible::after {
    background: color-mix(in srgb, var(--color-accent) 58%, transparent);
  }

  .explorer__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 36px 5px 10px 6px;
    scrollbar-color: color-mix(in srgb, var(--color-text-muted) 58%, transparent) transparent;
    scrollbar-width: thin;
  }

  .explorer__scroll::-webkit-scrollbar {
    width: 8px;
  }

  .explorer__scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .explorer__scroll::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-text-muted) 52%, transparent);
    background-clip: padding-box;
  }

  .explorer__section-label {
    margin-bottom: 5px;
    padding-left: 5px;
    font-size: 10px;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .explorer__tree {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .explorer__treeitem {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .explorer__row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    min-height: 23px;
    padding-left: calc((var(--level) - 1) * 11px);
  }

  .explorer__row::before,
  .explorer__row::after {
    content: '';
    position: absolute;
    pointer-events: none;
  }

  .explorer__row::before {
    left: calc((var(--level) - 1) * 11px + 8px);
    top: -3px;
    bottom: -3px;
    width: 1px;
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--color-border-subtle) 48%, transparent) 16%,
      color-mix(in srgb, var(--color-border-subtle) 72%, transparent) 52%,
      transparent 100%
    );
  }

  .explorer__row::after {
    left: calc((var(--level) - 1) * 11px + 8px);
    top: 50%;
    width: 8px;
    height: 1px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-border-subtle) 82%, transparent),
      transparent
    );
    transform: translateY(-0.5px);
  }

  .explorer__treeitem[aria-level='1'] > .explorer__row::before {
    top: 6px;
    bottom: 6px;
    opacity: 0.48;
  }

  .explorer__treeitem[aria-level='1'] > .explorer__row::after {
    width: 8px;
    opacity: 0.42;
  }

  .explorer__group {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .explorer__chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 20px;
    flex: 0 0 17px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      color var(--transition-base),
      background-color var(--transition-base),
      border-color var(--transition-base),
      box-shadow var(--transition-base);
  }

  .explorer__chevron:hover {
    color: var(--color-text-primary);
    border-color: color-mix(in srgb, var(--color-border-subtle) 38%, transparent);
    background: var(--color-surface-raised);
  }

  .explorer__chevron:focus-visible,
  .explorer__node:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--color-accent) 44%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent),
      0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent);
  }

  .explorer__chevron--placeholder {
    cursor: default;
  }

  .explorer__chevron--placeholder:hover {
    background: transparent;
    color: var(--color-text-muted);
  }

  .explorer__chevron-icon {
    width: 12px;
    height: 12px;
    display: inline-flex;
    transition: transform var(--transition-base);
  }

  .explorer__chevron-icon--open {
    transform: rotate(90deg);
  }

  .explorer__node {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    min-width: 0;
    padding: 3px 6px 3px 7px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--color-text-secondary);
    text-align: left;
    cursor: pointer;
    transition:
      color var(--transition-base),
      border-color var(--transition-base),
      background-color var(--transition-base),
      box-shadow var(--transition-base);
  }

  .explorer__node::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-accent) 70%, white 12%);
    opacity: 0;
    transform: scaleY(0.7);
    transition:
      opacity var(--transition-base),
      transform var(--transition-base);
  }

  .explorer__node:hover {
    color: var(--color-text-primary);
    border-color: transparent;
    background: color-mix(in srgb, var(--color-surface-raised) 48%, transparent);
  }

  .explorer__node.is-active {
    color: var(--color-text-primary);
    border-color: transparent;
    background: color-mix(in srgb, var(--color-text-primary) 10%, var(--color-surface-raised));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--color-text-primary) 8%, transparent),
      0 0 0 1px color-mix(in srgb, var(--color-hairline) 72%, transparent);
  }

  .explorer__node.is-active .explorer__node-main {
    color: color-mix(in srgb, var(--color-text-primary) 92%, white 8%);
  }

  .explorer__node.is-active::before {
    opacity: 1;
    transform: scaleY(1);
  }

  .explorer__treeitem.is-active > .explorer__row::before {
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--color-accent) 24%, transparent) 18%,
      color-mix(in srgb, var(--color-accent) 46%, transparent) 52%,
      transparent 100%
    );
  }

  .explorer__treeitem.is-active > .explorer__row::after {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-accent) 52%, transparent),
      transparent
    );
  }

  .explorer__treeitem.is-active > .explorer__row > .explorer__chevron {
    color: color-mix(in srgb, var(--color-accent) 42%, var(--color-text-primary));
    background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  }

  .explorer__node-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
    color: color-mix(in srgb, var(--color-text-secondary) 88%, white 12%);
  }

  .explorer__node-icon svg {
    width: 14px;
    height: 14px;
    overflow: visible;
  }

  .explorer__node-icon--collection,
  .explorer__node-icon--item,
  .explorer__node-icon--asset {
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
  }

  .explorer__node.is-active .explorer__node-icon {
    color: color-mix(in srgb, var(--color-accent) 34%, white 26%);
  }

  .explorer__node-main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    line-height: 1.25;
  }

  .explorer__node-meta,
  .explorer__asset-type {
    flex: 0 0 auto;
    font-size: 10px;
    color: color-mix(in srgb, var(--color-text-muted) 82%, transparent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .explorer__node.is-active .explorer__node-meta,
  .explorer__node.is-active .explorer__asset-type {
    color: color-mix(in srgb, var(--color-accent) 42%, var(--color-text-secondary));
  }

  .explorer__asset-type {
    min-width: 0;
  }

  .explorer__message {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .explorer__message--nested {
    padding: 4px 0 5px 28px;
  }

  .explorer__message--error {
    color: var(--color-danger);
  }

  @media (max-width: 900px) {
    .explorer.is-open {
      width: min(70vw, 280px);
      max-width: min(70vw, 280px);
    }
  }
</style>
