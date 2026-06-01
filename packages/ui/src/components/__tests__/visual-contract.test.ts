import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, relativePath), 'utf-8')
}

describe('design system visual contract', () => {
  it('defines the desktop typography and control tokens', () => {
    const tokens = readSource('../../tokens/tokens.css')

    expect(tokens).toContain('--font-size-xs: 12px;')
    expect(tokens).toContain('--font-size-sm: 14px;')
    expect(tokens).toContain('--font-size-md: 16px;')
    expect(tokens).toContain('--font-size-lg: 20px;')
    expect(tokens).toContain('--font-size-xl: 24px;')
    expect(tokens).toContain('--control-height-sm: 32px;')
    expect(tokens).toContain('--control-height-md: 40px;')
    expect(tokens).toContain('--control-height-lg: 48px;')
    expect(tokens).toContain('--color-surface-glass: #11131b;')
    expect(tokens).toContain('--color-accent-faint: rgba(174, 182, 216, 0.055);')
    expect(tokens).toContain(":root[data-theme='dim']")
    expect(tokens).toContain('--color-surface-glass: #211e17;')
    expect(tokens).toContain('--focus-ring: 0 0 0 3px rgba(154, 167, 255, 0.24);')
  })

  it('aligns button, input and search controls on shared tokens', () => {
    const button = readSource('../Button/Button.svelte')
    const input = readSource('../Input/Input.svelte')
    const searchBar = readSource('../SearchBar/SearchBar.svelte')

    expect(button).toContain('min-height: var(--control-height-md);')
    expect(button).toContain('box-shadow: var(--focus-ring);')

    expect(input).toContain('min-height: var(--control-height-md);')
    expect(input).toContain('box-shadow: var(--focus-ring);')

    expect(searchBar).toContain('min-height: var(--control-height-md);')
    expect(searchBar).toContain('box-shadow: var(--focus-ring);')
  })

  it('gives cards elevated sections and subtle dividers', () => {
    const card = readSource('../Card/Card.svelte')

    expect(card).toContain('var(--color-surface-elevated)')
    expect(card).toContain('border-bottom: 1px solid var(--color-hairline);')
    expect(card).toContain('border-top: 1px solid var(--color-hairline);')
  })
})
