/**
 * Geocoding frontend client for EntropIA desktop app.
 * Communicates with the Rust geo backend (Nominatim/OpenStreetMap).
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GeocodedEntity {
  entityId: string
  latitude: number
  longitude: number
  displayName: string
}

interface GeoEntityCompletePayload {
  entity_id: string
  latitude: number
  longitude: number
  display_name: string
}

interface GeoItemCompletePayload {
  item_id: string
  geocoded_count: number
  not_found_count: number
}

interface GeoErrorPayload {
  id: string
  error: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export class GeoStore {
  private unlisteners: UnlistenFn[] = []
  private listeners: Array<() => void> = []
  private onEntityComplete?: (entity: GeocodedEntity) => void
  private onItemComplete?: (itemId: string, geocoded: number, notFound: number) => void

  constructor(opts?: {
    onEntityComplete?: (entity: GeocodedEntity) => void
    onItemComplete?: (itemId: string, geocoded: number, notFound: number) => void
  }) {
    this.onEntityComplete = opts?.onEntityComplete
    this.onItemComplete = opts?.onItemComplete
  }

  onChange(fn: () => void) {
    this.listeners.push(fn)
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  async startListening() {
    this.unlisteners.push(
      await listen<GeoEntityCompletePayload>('geo:entity-complete', (event) => {
        const { entity_id, latitude, longitude, display_name } = event.payload
        this.onEntityComplete?.({
          entityId: entity_id,
          latitude,
          longitude,
          displayName: display_name,
        })
        this.notify()
      }),
      await listen<GeoItemCompletePayload>('geo:item-complete', (event) => {
        const { item_id, geocoded_count, not_found_count } = event.payload
        this.onItemComplete?.(item_id, geocoded_count, not_found_count)
        this.notify()
      }),
      await listen<GeoErrorPayload>('geo:error', (event) => {
        console.error('[geo]', event.payload.error)
        this.notify()
      }),
    )
  }

  stopListening() {
    this.unlisteners.forEach((fn) => fn())
    this.unlisteners = []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoke helpers
// ─────────────────────────────────────────────────────────────────────────────

export function geocodeEntity(entityId: string): Promise<string> {
  return invoke<string>('geocode_entity', { entityId })
}

export function geocodeItemEntities(itemId: string): Promise<string> {
  return invoke<string>('geocode_item_entities', { itemId })
}
