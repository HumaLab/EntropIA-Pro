export interface SearchBarProps {
  value?: string
  placeholder?: string
  debounceMs?: number
  ariaLabel?: string
  clearAriaLabel?: string
  emitSearch?: boolean
  onvaluechange?: (query: string, event: Event) => void
  onsearch?: (query: string) => void
  onclear?: () => void
  oninput?: (event: Event) => void
  onfocus?: (event: FocusEvent) => void
  onblur?: (event: FocusEvent) => void
  onkeydown?: (event: KeyboardEvent) => void
  inputRef?: (element: HTMLInputElement | undefined) => void
}
