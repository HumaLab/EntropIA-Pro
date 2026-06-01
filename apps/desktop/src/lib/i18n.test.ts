import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

const { settingsGetMock, settingsSetMock } = vi.hoisted(() => ({
  settingsGetMock: vi.fn(),
  settingsSetMock: vi.fn(),
}))

vi.mock('$lib/settings', async () => {
  const actual = await vi.importActual<typeof import('$lib/settings')>('$lib/settings')
  return {
    ...actual,
    settingsGet: settingsGetMock,
    settingsSet: settingsSetMock,
  }
})

describe('i18n', () => {
  beforeEach(async () => {
    settingsGetMock.mockReset().mockResolvedValue(null)
    settingsSetMock.mockReset().mockResolvedValue(undefined)

    const { locale } = await import('./i18n')
    locale.set('es')
  })

  it('defaults to spanish when no preference is stored', async () => {
    const { initLocale, locale, t } = await import('./i18n')

    await initLocale()

    expect(settingsGetMock).toHaveBeenCalledWith('language')
    expect(get(locale)).toBe('es')
    expect(t('app.initializing')).toBe('Inicializando...')
  })

  it('loads a saved language preference when it exists', async () => {
    settingsGetMock.mockResolvedValueOnce('en')

    const { initLocale, locale, t } = await import('./i18n')

    await initLocale()

    expect(get(locale)).toBe('en')
    expect(t('app.initializing')).toBe('Initializing...')
  })

  it('persists locale changes through frontend settings', async () => {
    const { setLocale, locale } = await import('./i18n')

    await setLocale('en')

    expect(settingsSetMock).toHaveBeenCalledWith('language', 'en')
    expect(get(locale)).toBe('en')
  })

  it('exposes db browser action copy in both locales', async () => {
    const { locale, t } = await import('./i18n')

    expect(t('dbBrowser.copyCell')).toBe('Copiar')
    expect(t('dbBrowser.pageSizeLabel')).toBe('Filas por página')

    locale.set('en')

    expect(t('dbBrowser.copyCell')).toBe('Copy')
    expect(t('dbBrowser.pageSizeLabel')).toBe('Rows per page')
  })
})
