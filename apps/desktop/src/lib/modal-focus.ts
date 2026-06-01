export const MODAL_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function getFocusableElements(container: ParentNode | null): HTMLElement[] {
  if (!container) return []

  return Array.from(container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && !element.hasAttribute('hidden')
  )
}

export function getNextFocusTrapTarget(
  focusableElements: HTMLElement[],
  currentElement: HTMLElement | null,
  shiftKey: boolean,
  fallbackElement: HTMLElement | null = null
): HTMLElement | null {
  if (focusableElements.length === 0) {
    return fallbackElement
  }

  const currentIndex = currentElement ? focusableElements.indexOf(currentElement) : -1
  const firstElement = focusableElements[0] ?? fallbackElement
  const lastElement = focusableElements[focusableElements.length - 1] ?? fallbackElement

  if (shiftKey) {
    return currentIndex <= 0 ? lastElement : (focusableElements[currentIndex - 1] ?? lastElement)
  }

  return currentIndex === -1 || currentIndex === focusableElements.length - 1
    ? firstElement
    : (focusableElements[currentIndex + 1] ?? firstElement)
}
