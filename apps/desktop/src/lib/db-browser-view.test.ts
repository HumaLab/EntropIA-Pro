import { describe, expect, it } from 'vitest'
import { getDbBrowserCellContent } from './db-browser-view'

describe('getDbBrowserCellContent', () => {
  it('pretty-prints JSON strings for expanded viewing', () => {
    const result = getDbBrowserCellContent('{"title":"Acta","meta":{"page":2}}', '—')

    expect(result.rawText).toBe('{"title":"Acta","meta":{"page":2}}')
    expect(result.isJson).toBe(true)
    expect(result.canExpand).toBe(true)
    expect(result.expandedText).toContain('\n  "title": "Acta"')
    expect(result.expandedText).toContain('\n  "meta": {')
  })

  it('serializes object values without losing pretty JSON in the dialog', () => {
    const result = getDbBrowserCellContent({ ok: true, count: 3 }, '—')

    expect(result.rawText).toBe('{"ok":true,"count":3}')
    expect(result.isJson).toBe(true)
    expect(result.canExpand).toBe(true)
    expect(result.expandedText).toContain('"ok": true')
    expect(result.expandedText).toContain('"count": 3')
  })

  it('keeps long plain text copyable and expandable', () => {
    const longText = 'Texto largo '.repeat(20).trim()

    const result = getDbBrowserCellContent(longText, '—')

    expect(result.rawText).toBe(longText)
    expect(result.isJson).toBe(false)
    expect(result.canExpand).toBe(true)
    expect(result.expandedText).toBe(longText)
  })

  it('returns the empty placeholder without actions for null values', () => {
    const result = getDbBrowserCellContent(null, '—')

    expect(result.rawText).toBe('—')
    expect(result.canExpand).toBe(false)
    expect(result.hasValue).toBe(false)
  })
})
