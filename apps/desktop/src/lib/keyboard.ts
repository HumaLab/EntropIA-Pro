import { navigation } from './navigation'

/**
 * Global keyboard handler for the desktop app.
 * - Escape → navigate back
 * Returns a cleanup function that removes the listener.
 */
export function setupKeyboardShortcuts(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      navigation.back()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
