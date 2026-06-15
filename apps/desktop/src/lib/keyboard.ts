import { navigation } from './navigation'

/**
 * Escape interceptors let views consume the global Escape key before it
 * triggers back-navigation — e.g. cancel an active editing mode or guard
 * unsaved changes. Handlers run most-recently-registered first; the first
 * one that returns true consumes the key and navigation is skipped.
 */
export type EscapeInterceptor = () => boolean

const escapeInterceptors: EscapeInterceptor[] = []

/**
 * Register an Escape interceptor. Returns an unregister function — callers
 * (views) must unregister on unmount.
 */
export function registerEscapeInterceptor(interceptor: EscapeInterceptor): () => void {
  escapeInterceptors.push(interceptor)
  return () => {
    const index = escapeInterceptors.indexOf(interceptor)
    if (index >= 0) escapeInterceptors.splice(index, 1)
  }
}

/** Run interceptors LIFO; true when one of them consumed the Escape. */
function consumeEscape(): boolean {
  for (let i = escapeInterceptors.length - 1; i >= 0; i--) {
    if (escapeInterceptors[i]!()) return true
  }
  return false
}

/**
 * Global keyboard handler for the desktop app.
 * - Escape → first lets registered interceptors cancel in-progress work;
 *   otherwise navigates back.
 * Returns a cleanup function that removes the listener.
 */
export function setupKeyboardShortcuts(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || shouldIgnoreGlobalEscape(e)) return
    if (consumeEscape()) return
    navigation.back()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

function shouldIgnoreGlobalEscape(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return true

  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
    return true
  }

  const target = e.target instanceof Element ? e.target : null
  if (!target) return false

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.closest('[contenteditable="true"]') !== null
  )
}
