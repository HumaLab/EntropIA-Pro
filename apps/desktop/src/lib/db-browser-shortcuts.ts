type ExpandedCellShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'target'
>

export function shouldCopyExpandedCellFromShortcut(event: ExpandedCellShortcutEvent): boolean {
  const key = event.key.toLowerCase()
  const usesCopyModifier = (event.ctrlKey || event.metaKey) && !(event.ctrlKey && event.metaKey)

  if (!usesCopyModifier || event.altKey || event.shiftKey || key !== 'c') {
    return false
  }

  return !isEditableTarget(event.target)
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  return target.isContentEditable
}
