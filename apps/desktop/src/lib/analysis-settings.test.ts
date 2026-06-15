import { describe, it, expect, beforeEach } from 'vitest'
import {
  clampCloudTermCount,
  defaultAnalysisSettings,
  loadAnalysisSettings,
  parseStopwordsInput,
  saveAnalysisSettings,
  DEFAULT_CLOUD_TERMS,
  MAX_CLOUD_TERMS,
  MIN_CLOUD_TERMS,
} from './analysis-settings'

beforeEach(() => {
  localStorage.clear()
})

describe('clampCloudTermCount', () => {
  it('clamps to the 20-100 range and rounds', () => {
    expect(clampCloudTermCount(19)).toBe(MIN_CLOUD_TERMS)
    expect(clampCloudTermCount(101)).toBe(MAX_CLOUD_TERMS)
    expect(clampCloudTermCount(50)).toBe(50)
    expect(clampCloudTermCount(33.6)).toBe(34)
  })

  it('falls back to the default for non-finite values', () => {
    expect(clampCloudTermCount(Number.NaN)).toBe(DEFAULT_CLOUD_TERMS)
    expect(clampCloudTermCount(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CLOUD_TERMS)
  })
})

describe('parseStopwordsInput', () => {
  it('splits on commas, semicolons, whitespace and newlines', () => {
    expect(parseStopwordsInput('fábrica, obrero;huelga\npescado  mar')).toEqual([
      'fábrica',
      'obrero',
      'huelga',
      'pescado',
      'mar',
    ])
  })

  it('normalizes NFC + lowercase and deduplicates', () => {
    expect(parseStopwordsInput('FÁBRICA fábrica fábrica')).toEqual(['fábrica'])
  })

  it('returns empty array for blank input', () => {
    expect(parseStopwordsInput('')).toEqual([])
    expect(parseStopwordsInput('  , ;\n ')).toEqual([])
  })
})

describe('load/save analysis settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadAnalysisSettings('col-1')).toEqual(defaultAnalysisSettings())
  })

  it('round-trips settings per collection', () => {
    saveAnalysisSettings('col-1', { cloudTermCount: 80, customStopwords: ['fábrica'] })
    saveAnalysisSettings('col-2', { cloudTermCount: 25, customStopwords: [] })

    expect(loadAnalysisSettings('col-1')).toEqual({
      cloudTermCount: 80,
      customStopwords: ['fábrica'],
    })
    expect(loadAnalysisSettings('col-2')).toEqual({ cloudTermCount: 25, customStopwords: [] })
  })

  it('sanitizes stored values on load', () => {
    localStorage.setItem(
      'entropia-collection-analysis-settings:col-1',
      JSON.stringify({ cloudTermCount: 999, customStopwords: ['  FÁBRICA ', 'mar'] })
    )
    expect(loadAnalysisSettings('col-1')).toEqual({
      cloudTermCount: MAX_CLOUD_TERMS,
      customStopwords: ['fábrica', 'mar'],
    })
  })

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem('entropia-collection-analysis-settings:col-1', '{not json')
    expect(loadAnalysisSettings('col-1')).toEqual(defaultAnalysisSettings())

    localStorage.setItem(
      'entropia-collection-analysis-settings:col-2',
      JSON.stringify({ cloudTermCount: 'abc', customStopwords: 'no-array' })
    )
    expect(loadAnalysisSettings('col-2')).toEqual(defaultAnalysisSettings())
  })
})
