import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type RuntimeState =
  | 'healthy'
  | 'repairing'
  | 'checking'
  | 'downloading'
  | 'hydrating'
  | 'verifying'
  | 'damaged'
  | 'fixture'
  | 'incompatible'
  | 'blocked_offline'
  | 'blocked_source_unavailable'
export type RuntimeCapability = 'ocr' | 'transcription' | 'nlp'
export type RuntimeOperationKind = 'bootstrap' | 'repair'
export type RuntimeOperationStage =
  | 'checking'
  | 'planning_download'
  | 'downloading'
  | 'hydrating'
  | 'verifying'
  | 'activating'
  | 'blocked'
export type RuntimeBootstrapSource = 'managed_ready' | 'bundled_release' | 'trusted_remote'

export interface RuntimeOperation {
  kind: RuntimeOperationKind
  stage: RuntimeOperationStage
  summary: string
  progressPercent: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  retryable: boolean
}

export interface RuntimeBootstrapRemoteSource {
  manifestUrl: string
  publicKeyId: string
}

export interface RuntimeBootstrapDownloadPlan {
  archiveUrl: string
  archiveSha256: string
  archiveSize: number
  archivePath: string
  stagingPath: string
  resumeMetadataPath: string
}

export interface RuntimeBootstrapPlan {
  eligible: boolean
  required: boolean
  source: RuntimeBootstrapSource | null
  packVersion: string | null
  summary: string
  reason: string | null
  remoteSource: RuntimeBootstrapRemoteSource | null
  download: RuntimeBootstrapDownloadPlan | null
}

export interface RuntimeStatus {
  state: RuntimeState
  packVersion: string | null
  repairNeeded: boolean
  repairAvailable: boolean
  summary: string
  blockedCapabilities: RuntimeCapability[]
  details: string[]
  guidance: string[]
  bootstrapEligible: boolean
  bootstrapRequired: boolean
  activeOperation: RuntimeOperation | null
}

export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>('runtime_get_status')
}

export function getRuntimeBootstrapPlan(): Promise<RuntimeBootstrapPlan> {
  return invoke<RuntimeBootstrapPlan>('runtime_get_bootstrap_plan')
}

export function repairRuntime(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>('runtime_repair')
}

export function onRuntimeStatus(callback: (status: RuntimeStatus) => void): Promise<UnlistenFn> {
  return listen<RuntimeStatus>('runtime://status', (event) => callback(event.payload))
}

export function onRuntimeProgress(
  callback: (operation: RuntimeOperation) => void,
): Promise<UnlistenFn> {
  return listen<RuntimeOperation>('runtime://progress', (event) => callback(event.payload))
}

export function runtimeNeedsAttention(status: RuntimeStatus | null | undefined): boolean {
  return (
    status != null &&
    [
      'repairing',
      'damaged',
      'fixture',
      'incompatible',
      'checking',
      'downloading',
      'hydrating',
      'verifying',
      'blocked_offline',
      'blocked_source_unavailable',
    ].includes(status.state)
  )
}

export function runtimeBlocksCurrentUse(
  status: RuntimeStatus | null | undefined,
  localDepsReady: boolean,
  devFallbackAvailable = false,
): boolean {
  if (status?.state === 'fixture' && localDepsReady) return false
  if (
    localDepsReady &&
    devFallbackAvailable &&
    (status?.state === 'blocked_source_unavailable' || status?.state === 'blocked_offline')
  ) {
    return false
  }
  return runtimeNeedsAttention(status)
}

export function shouldShowRuntimeRepairAction(status: RuntimeStatus | null | undefined): boolean {
  return (
    status?.repairAvailable === true &&
    status.state !== 'repairing' &&
    status.state !== 'fixture' &&
    status.state !== 'incompatible' &&
    status.state !== 'blocked_offline' &&
    status.state !== 'blocked_source_unavailable'
  )
}

export function runtimeCanBootstrapAutomatically(
  status: RuntimeStatus | null | undefined,
): boolean {
  return Boolean(status?.bootstrapEligible && status.state !== 'healthy')
}
