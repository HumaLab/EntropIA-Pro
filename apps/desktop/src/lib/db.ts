import { initStore, type StoreApi } from '@entropia/store'

let _store: StoreApi | null = null

export async function initDb(): Promise<void> {
  _store = await initStore()
}

export function getStore(): StoreApi {
  if (!_store) throw new Error('Store not initialized. Call initDb() first.')
  return _store
}
