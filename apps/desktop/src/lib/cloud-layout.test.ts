import { describe, it, expect } from 'vitest'
import { layoutWordCloud, type CloudWordInput, type PlacedCloudWord } from './cloud-layout'

// Deterministic measure so tests don't depend on canvas availability.
const measure = (word: string, fontSizePx: number) => ({
  width: word.length * fontSizePx * 0.6,
  height: fontSizePx * 1.1,
})

const BASE_OPTS = { width: 480, height: 320, measure }

// Zipf-like counts (long tail at minimum size) mirroring real corpora.
function sampleWords(n: number): CloudWordInput[] {
  return Array.from({ length: n }, (_, i) => ({
    word: `palabra${i}`,
    count: Math.ceil(n / (i + 1)),
  }))
}

function boxFor(placedWord: PlacedCloudWord) {
  const m = measure(placedWord.word, placedWord.fontSize)
  const w = placedWord.rotated ? m.height : m.width
  const h = placedWord.rotated ? m.width : m.height
  return {
    x0: placedWord.x - w / 2,
    y0: placedWord.y - h / 2,
    x1: placedWord.x + w / 2,
    y1: placedWord.y + h / 2,
  }
}

describe('layoutWordCloud', () => {
  it('returns empty for empty input', () => {
    expect(layoutWordCloud([], BASE_OPTS)).toEqual([])
  })

  it('places the highest-count word at the canvas center', () => {
    const placed = layoutWordCloud(sampleWords(10), BASE_OPTS)
    expect(placed[0]!.word).toBe('palabra0')
    expect(placed[0]!.x).toBeCloseTo(240, 0)
    expect(placed[0]!.y).toBeCloseTo(160, 0)
  })

  it('places all words without overlaps', () => {
    const placed = layoutWordCloud(sampleWords(50), BASE_OPTS)
    expect(placed.length).toBe(50)

    const boxes = placed.map(boxFor)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
        expect(overlap, `${placed[i]!.word} overlaps ${placed[j]!.word}`).toBe(false)
      }
    }
  })

  it('keeps every placed word inside the canvas bounds', () => {
    const placed = layoutWordCloud(sampleWords(80), BASE_OPTS)
    for (const word of placed) {
      const box = boxFor(word)
      expect(box.x0).toBeGreaterThanOrEqual(0)
      expect(box.y0).toBeGreaterThanOrEqual(0)
      expect(box.x1).toBeLessThanOrEqual(480)
      expect(box.y1).toBeLessThanOrEqual(320)
    }
  })

  it('is deterministic for the same input', () => {
    const first = layoutWordCloud(sampleWords(30), BASE_OPTS)
    const second = layoutWordCloud(sampleWords(30), BASE_OPTS)
    expect(second).toEqual(first)
  })

  it('scales font size with count between the configured bounds', () => {
    const placed = layoutWordCloud(sampleWords(20), {
      ...BASE_OPTS,
      minFontSize: 10,
      maxFontSize: 40,
    })
    const byWord = new Map(placed.map((p) => [p.word, p]))
    expect(byWord.get('palabra0')!.fontSize).toBe(40)
    expect(byWord.get('palabra19')!.fontSize).toBe(10)
  })

  it('uses the mid font size when all counts are equal', () => {
    const placed = layoutWordCloud(
      [
        { word: 'uno', count: 3 },
        { word: 'dos', count: 3 },
      ],
      { ...BASE_OPTS, minFontSize: 10, maxFontSize: 40 }
    )
    for (const word of placed) {
      expect(word.fontSize).toBe(25)
    }
  })

  it('skips words too large for the canvas', () => {
    const placed = layoutWordCloud(
      [
        { word: 'palabraextraordinariamentelargaquenoentra', count: 10 },
        { word: 'corta', count: 1 },
      ],
      { width: 120, height: 80, measure, minFontSize: 20, maxFontSize: 40 }
    )
    expect(placed.map((p) => p.word)).toEqual(['corta'])
  })

  it('never rotates when rotationRatio is 0', () => {
    const placed = layoutWordCloud(sampleWords(40), { ...BASE_OPTS, rotationRatio: 0 })
    expect(placed.every((p) => !p.rotated)).toBe(true)
  })

  it('auto-fits very dense clouds (100 terms) by scaling fonts down', () => {
    const placed = layoutWordCloud(sampleWords(100), { ...BASE_OPTS, minFontSize: 9 })
    expect(placed.length).toBeGreaterThanOrEqual(95)

    const boxes = placed.map(boxFor)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
        expect(overlap, `${placed[i]!.word} overlaps ${placed[j]!.word}`).toBe(false)
      }
    }
  })

  it('rotates a deterministic subset when rotationRatio is set', () => {
    const placed = layoutWordCloud(sampleWords(40), { ...BASE_OPTS, rotationRatio: 0.25 })
    const rotatedWords = placed.filter((p) => p.rotated).map((p) => p.word)
    expect(rotatedWords.length).toBeGreaterThan(0)
    expect(rotatedWords.length).toBeLessThan(placed.length)

    const again = layoutWordCloud(sampleWords(40), { ...BASE_OPTS, rotationRatio: 0.25 })
    expect(again.filter((p) => p.rotated).map((p) => p.word)).toEqual(rotatedWords)
  })
})
