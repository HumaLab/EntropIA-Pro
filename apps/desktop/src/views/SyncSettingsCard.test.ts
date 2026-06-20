import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import SyncSettingsCard from './SyncSettingsCard.svelte'
import { locale } from '$lib/i18n'
import type { SyncDevice, SyncStatus, SyncUsage, PlanCatalogItem } from '$lib/sync'

const mockInvoke = vi.mocked(invoke)

function usage(overrides: Partial<SyncUsage> = {}): SyncUsage {
  return {
    rows: 0,
    blobs_count: 0,
    blobs_bytes: 0,
    quota_bytes: 5_000_000_000,
    plan_name: 'Free',
    expires_at: null,
    unread_notifications: 0,
    pending_plan_request: null,
    ...overrides,
  }
}

const PLANS: PlanCatalogItem[] = [
  { id: 'free', name: 'Free', quota_bytes: 0, price_cents: 0, currency: 'ARS', period: 'month', description: null, is_current: true },
  { id: 'gb5', name: '5 GB', quota_bytes: 5_000_000_000, price_cents: 1000, currency: 'ARS', period: 'month', description: null, is_current: false },
  { id: 'gb10', name: '10 GB', quota_bytes: 10_000_000_000, price_cents: 1800, currency: 'ARS', period: 'month', description: null, is_current: false },
]

// ── sync-store mock: report an active (idle) session so the logged-in surface renders.
const { syncStoreMock } = vi.hoisted(() => {
  const current: SyncStatus = {
    state: 'idle',
    last_sync_at: null,
    pending: 0,
    blobs_pending: 0,
    pending_blob_bytes: 0,
    conflicts: 0,
    clock_warning: false,
  }
  return {
    syncStoreMock: {
      get status() {
        return current
      },
      subscribe(run: (v: SyncStatus) => void) {
        run(current)
        return () => {}
      },
      initialize: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn(),
    },
  }
})

vi.mock('$lib/sync-store', () => ({
  syncStore: syncStoreMock,
}))

/** Routes invoke calls by command name; defaults cover the card's refreshAll fan-out. */
function routeInvoke(handlers: Partial<Record<string, (args?: unknown) => unknown>> = {}) {
  mockInvoke.mockImplementation((cmd: string, args?: unknown) => {
    const handler = handlers[cmd]
    if (handler) return Promise.resolve(handler(args))
    switch (cmd) {
      case 'sync_list_devices':
        return Promise.resolve([])
      case 'sync_list_conflicts':
        return Promise.resolve([])
      case 'sync_get_usage':
        return Promise.resolve(usage())
      case 'sync_list_plans':
        return Promise.resolve(PLANS)
      default:
        return Promise.resolve(undefined)
    }
  })
}

describe('SyncSettingsCard — plan change request', () => {
  beforeEach(() => {
    locale.set('es')
    mockInvoke.mockReset()
    routeInvoke()
  })

  afterEach(() => {
    mockInvoke.mockReset()
  })

  it('opens the plan modal and renders the target-plan select (current excluded)', async () => {
    render(SyncSettingsCard)
    // Wait for the upgrade button to appear (usage resolved → plan action block).
    const button = await screen.findByText('Solicitar cambio de plan')
    await fireEvent.click(button)

    // Modal title + current plan (read-only) + disclaimer.
    expect(await screen.findByText('Solicitar cambio de plan', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByText(/Plan actual/)).toBeInTheDocument()
    expect(screen.getByText(/Esto es una SOLICITUD/)).toBeInTheDocument()

    // The select offers the two non-current plans, not Free (is_current).
    await waitFor(() => {
      const options = Array.from(document.querySelectorAll('#sync-plan-target option'))
      const labels = options.map((o) => o.textContent?.trim())
      expect(labels.some((l) => l?.startsWith('5 GB'))).toBe(true)
      expect(labels.some((l) => l?.startsWith('10 GB'))).toBe(true)
      expect(labels.some((l) => l === 'Free' || l?.startsWith('Free ·'))).toBe(false)
    })
  })

  it('submits a plan change request with the selected plan id (camelCase wire arg)', async () => {
    const requestSpy = vi.fn().mockReturnValue({
      id: 'req-1',
      current_plan_id: 'free',
      requested_plan_id: 'gb5',
      note: null,
      status: 'pending',
      created_at: 1,
    })
    routeInvoke({ sync_request_plan_change: (args) => requestSpy(args) })

    render(SyncSettingsCard)
    await fireEvent.click(await screen.findByText('Solicitar cambio de plan'))

    const select = (await screen.findByLabelText(
      'Plan al que querés cambiar'
    )) as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'gb5' } })

    await fireEvent.click(screen.getByText('Enviar solicitud'))

    await waitFor(() =>
      expect(requestSpy).toHaveBeenCalledWith({ requestedPlanId: 'gb5', note: undefined })
    )
    // Success flips the persistent "en revisión" banner.
    expect(await screen.findByText(/Solicitud en revisión: 5 GB/)).toBeInTheDocument()
  })

  it('shows the persistent "en revisión" state when usage reports a pending request', async () => {
    routeInvoke({ sync_get_usage: () => usage({ pending_plan_request: '10 GB' }) })

    render(SyncSettingsCard)
    expect(await screen.findByText(/Solicitud en revisión: 10 GB/)).toBeInTheDocument()
    // The request button is replaced by a disabled "en revisión" button.
    expect(screen.queryByText('Solicitar cambio de plan')).not.toBeInTheDocument()
  })

  it('treats a 409 (plan_request_pending) as "already in review"', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      switch (cmd) {
        case 'sync_list_devices':
        case 'sync_list_conflicts':
          return Promise.resolve([])
        case 'sync_get_usage':
          return Promise.resolve(usage())
        case 'sync_list_plans':
          return Promise.resolve(PLANS)
        case 'sync_request_plan_change':
          return Promise.reject('api error 409 (plan_request_pending): in review')
        default:
          return Promise.resolve(undefined)
      }
    })

    render(SyncSettingsCard)
    await fireEvent.click(await screen.findByText('Solicitar cambio de plan'))

    const select = (await screen.findByLabelText(
      'Plan al que querés cambiar'
    )) as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'gb5' } })
    await fireEvent.click(screen.getByText('Enviar solicitud'))

    // The persistent banner appears (text + disabled button both carry the phrase).
    await waitFor(() =>
      expect(screen.getByText(/Solicitud en revisión: 5 GB/)).toBeInTheDocument()
    )
  })
})

function device(overrides: Partial<SyncDevice> = {}): SyncDevice {
  return {
    id: 'd-1',
    name: 'DESKTOP-BJV5O0U',
    platform: 'windows',
    created_at: 1_700_000_000_000,
    last_seen_at: 1_700_000_000_000,
    revoked: false,
    current: false,
    ...overrides,
  }
}

describe('SyncSettingsCard — device list deduping', () => {
  beforeEach(() => {
    locale.set('es')
    mockInvoke.mockReset()
    routeInvoke()
  })

  afterEach(() => {
    mockInvoke.mockReset()
  })

  it('collapses repeated sessions for the same physical device to the current row', async () => {
    routeInvoke({
      sync_list_devices: () => [
        device({ id: 'old-1', last_seen_at: 1, revoked: false }),
        device({ id: 'old-2', last_seen_at: 2, revoked: true }),
        device({ id: 'old-3', last_seen_at: 3, revoked: true }),
        device({ id: 'old-4', last_seen_at: 4, revoked: true }),
        device({ id: 'current', last_seen_at: 5, current: true }),
      ],
    })

    render(SyncSettingsCard)

    await waitFor(() => expect(screen.getAllByText('DESKTOP-BJV5O0U')).toHaveLength(1))
    expect(screen.getByText('Este dispositivo')).toBeInTheDocument()
    expect(screen.queryByText('Desconectado')).not.toBeInTheDocument()
    expect(screen.queryByText('Revocado')).not.toBeInTheDocument()
  })

  it('shows disconnected copy for a revoked device that is not duplicated', async () => {
    routeInvoke({
      sync_list_devices: () => [
        device({ id: 'current', current: true }),
        device({ id: 'phone', name: 'Teléfono', platform: 'android', revoked: true }),
      ],
    })

    render(SyncSettingsCard)

    await waitFor(() => expect(screen.getByText('Desconectado')).toBeInTheDocument())
    expect(screen.queryByText('Revocado')).not.toBeInTheDocument()
  })

  it('preserves the active chosen row id for revoke actions', async () => {
    const revokeSpy = vi.fn().mockResolvedValue(undefined)
    routeInvoke({
      sync_list_devices: () => [
        device({ id: 'old', revoked: true }),
        device({ id: 'active', revoked: false }),
      ],
      sync_revoke_device: (args) => revokeSpy(args),
    })

    render(SyncSettingsCard)

    await fireEvent.click(await screen.findByRole('button', { name: 'Revocar' }))
    const dialog = await screen.findByRole('dialog')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Revocar' }))

    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith({ deviceId: 'active' }))
  })
})
