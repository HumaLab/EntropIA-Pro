import { invoke } from '@tauri-apps/api/core'

export function normalizeExternalUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only HTTP(S) URLs can be opened externally.')
  }
  return url.href
}

export async function openExternalUrl(rawUrl: string): Promise<void> {
  await invoke('open_external_url', { url: normalizeExternalUrl(rawUrl) })
}

export async function openExternalUrlFromClick(event: MouseEvent, rawUrl: string): Promise<void> {
  event.preventDefault()
  await openExternalUrl(rawUrl)
}
