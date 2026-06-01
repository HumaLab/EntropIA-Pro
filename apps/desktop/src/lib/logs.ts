import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type AppLogLevel = 'info' | 'warn' | 'error'

export interface AppLogEntry {
  id: number
  timestamp_ms: number
  level: AppLogLevel
  source: string
  message: string
}

export function getLogs(): Promise<AppLogEntry[]> {
  return invoke<AppLogEntry[]>('logs_get')
}

export function clearLogs(): Promise<void> {
  return invoke<void>('logs_clear')
}

export function openLogsDir(): Promise<void> {
  return invoke<void>('logs_open_dir')
}

export function onLogEntry(callback: (entry: AppLogEntry) => void): Promise<UnlistenFn> {
  return listen<AppLogEntry>('logs://entry', (event) => callback(event.payload))
}

export function formatLogEntry(entry: AppLogEntry): string {
  const time = new Date(entry.timestamp_ms).toLocaleString('es-AR')
  return `[${time}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`
}
