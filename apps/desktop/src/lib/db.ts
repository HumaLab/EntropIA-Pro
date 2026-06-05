import { initStore, type StoreApi } from '@entropia/store'
import { createTauriDbClient } from './tauri-db-client'

let _store: StoreApi | null = null

export async function initDb(): Promise<void> {
  _store = await initStore(createTauriDbClient())
}

export function getStore(): StoreApi {
  if (!_store) throw new Error('Store not initialized. Call initDb() first.')
  return _store
}
