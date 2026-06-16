import { describe, expect, it } from 'vitest'
import {
  buildManualEntityCreatePayload,
  buildManualEntityUpdatePayload,
  normalizeManualEntityValue,
  toEditableEntityType,
} from './item-view-entities'

describe('normalizeManualEntityValue', () => {
  it('trims whitespace, quotes, guillemets, and dashes around manual values', () => {
    expect(normalizeManualEntityValue('  “— Mar del Plata —”  ')).toBe('Mar del Plata')
    expect(normalizeManualEntityValue(" 'Rosario' ")).toBe('Rosario')
    expect(normalizeManualEntityValue('  ')).toBe('')
  })
})

describe('toEditableEntityType', () => {
  it('keeps editable entity types', () => {
    expect(toEditableEntityType('person')).toBe('person')
    expect(toEditableEntityType('organization')).toBe('organization')
    expect(toEditableEntityType('place')).toBe('place')
    expect(toEditableEntityType('misc')).toBe('misc')
    expect(toEditableEntityType('date')).toBe('date')
  })

  it('coerces non-editable entity types to organization', () => {
    expect(toEditableEntityType('institution')).toBe('organization')
    expect(toEditableEntityType('custom')).toBe('organization')
  })
})

describe('buildManualEntityCreatePayload', () => {
  it('builds the manual create payload with selected asset and injected timestamp', () => {
    expect(
      buildManualEntityCreatePayload({
        itemId: 'item-1',
        assetId: 'asset-1',
        entityType: 'date',
        value: '21 de agosto de 1970',
        now: () => 123,
      })
    ).toEqual({
      itemId: 'item-1',
      assetId: 'asset-1',
      entityType: 'date',
      value: '21 de agosto de 1970',
      startOffset: 0,
      endOffset: 0,
      confidence: 1,
      source: 'manual',
      modelName: null,
      createdAt: 123,
    })
  })

  it('keeps null asset scope for item-level manual entities', () => {
    expect(
      buildManualEntityCreatePayload({
        itemId: 'item-1',
        assetId: null,
        entityType: 'organization',
        value: 'Archivo General',
        now: () => 456,
      }).assetId
    ).toBeNull()
  })
})

describe('buildManualEntityUpdatePayload', () => {
  it('builds the manual update payload from the existing entity type', () => {
    expect(buildManualEntityUpdatePayload({ entityType: 'place' }, 'La Plata')).toEqual({
      entityType: 'place',
      value: 'La Plata',
      confidence: 1,
      source: 'manual',
    })
  })

  it('coerces non-editable update types to organization', () => {
    expect(buildManualEntityUpdatePayload({ entityType: 'institution' }, 'UBA')).toEqual({
      entityType: 'organization',
      value: 'UBA',
      confidence: 1,
      source: 'manual',
    })
  })
})
