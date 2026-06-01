<script lang="ts">
  import { onMount } from 'svelte'
  import { initDb } from '$lib/db'
  import { navigation } from '$lib/navigation'
  import { setupKeyboardShortcuts } from '$lib/keyboard'
  import { initLocale, t } from '$lib/i18n'
  import type { View } from '$lib/navigation'
  import AppShell from './layout/AppShell.svelte'
  import CollectionsView from './views/CollectionsView.svelte'
  import CollectionView from './views/CollectionView.svelte'
  import ItemView from './views/ItemView.svelte'
  import DbBrowserView from './views/DbBrowserView.svelte'
  import SettingsView from './views/SettingsView.svelte'

  let ready = $state(false)
  let error = $state<string | null>(null)
  const currentView = $derived($navigation.current as View)
  const currentViewName = $derived(($navigation.current as { name: string }).name)

  onMount(() => {
    console.log('[App] onMount starting')
    const cleanupKeyboard = setupKeyboardShortcuts()

    Promise.all([initLocale(), initDb()])
      .then(() => {
        console.log('[App] initDb complete')
        ready = true
      })
      .catch((e) => {
        console.log('[App] initDb ERROR:', e)
        error = e instanceof Error ? e.message : t('app.initError')
      })

    return cleanupKeyboard
  })
</script>

{#if !ready && !error}
  <div class="loading"><p>{t('app.initializing')}</p></div>
{:else if error}
  <div class="error"><p>{error}</p></div>
{:else}
  <AppShell>
    {#if currentViewName === 'collections'}
      <CollectionsView />
    {:else if currentViewName === 'collection'}
      <CollectionView collectionId={(currentView as Extract<View, { name: 'collection' }>).id} />
    {:else if currentViewName === 'item'}
      <ItemView
        itemId={(currentView as Extract<View, { name: 'item' }>).itemId}
        collectionId={(currentView as Extract<View, { name: 'item' }>).collectionId}
      />
    {:else if currentViewName === 'db-browser'}
      <DbBrowserView />
    {:else if currentViewName === 'settings'}
      <SettingsView />
    {/if}
  </AppShell>
{/if}

<style>
  .loading,
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .error p {
    color: var(--color-danger);
  }
</style>
