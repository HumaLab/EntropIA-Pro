const LONG_CELL_THRESHOLD = 120

export interface DbBrowserCellContent {
  rawText: string
  expandedText: string
  isJson: boolean
  canExpand: boolean
  hasValue: boolean
}

export function getDbBrowserCellContent(
  value: unknown,
  emptyPlaceholder: string
): DbBrowserCellContent {
  if (value == null) {
    return {
      rawText: emptyPlaceholder,
      expandedText: emptyPlaceholder,
      isJson: false,
      canExpand: false,
      hasValue: false,
    }
  }

  if (typeof value === 'string') {
    const parsedJson = parseJsonString(value)
    if (parsedJson) {
      return {
        rawText: value,
        expandedText: JSON.stringify(parsedJson, null, 2),
        isJson: true,
        canExpand: true,
        hasValue: true,
      }
    }

    return {
      rawText: value,
      expandedText: value,
      isJson: false,
      canExpand: value.length > LONG_CELL_THRESHOLD,
      hasValue: true,
    }
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    const text = String(value)
    return {
      rawText: text,
      expandedText: text,
      isJson: false,
      canExpand: false,
      hasValue: true,
    }
  }

  try {
    const rawText = JSON.stringify(value)
    const expandedText = JSON.stringify(value, null, 2)

    return {
      rawText,
      expandedText,
      isJson: true,
      canExpand: true,
      hasValue: true,
    }
  } catch {
    const fallback = String(value)
    return {
      rawText: fallback,
      expandedText: fallback,
      isJson: false,
      canExpand: fallback.length > LONG_CELL_THRESHOLD,
      hasValue: true,
    }
  }
}

function parseJsonString(value: string): unknown | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))

  if (!looksLikeJson) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}
