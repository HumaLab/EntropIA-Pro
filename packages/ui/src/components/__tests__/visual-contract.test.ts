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
    expect(tokens).toContain('--font-size-lg: 18px;')
    expect(tokens).toContain('--font-size-xl: 22px;')
    expect(tokens).toContain('--control-height-sm: 30px;')
    expect(tokens).toContain('--control-height-md: 36px;')
    expect(tokens).toContain('--control-height-lg: 40px;')
    expect(tokens).toContain('--color-surface-glass: #10131a;')
    expect(tokens).toContain('--color-accent-faint: rgba(154, 164, 199, 0.06);')
    expect(tokens).toContain(":root[data-theme='dim']")
    expect(tokens).toContain('--color-surface-glass: #211e17;')
    expect(tokens).toContain('--focus-ring: 0 0 0 2px rgba(154, 164, 199, 0.22);')
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

  it('keeps visual primitives on semantic surface and state tokens', () => {
    const panel = readSource('../Panel/Panel.svelte')
    const tabList = readSource('../Tabs/TabList.svelte')
    const tabButton = readSource('../Tabs/TabButton.svelte')
    const iconButton = readSource('../IconButton/IconButton.svelte')
    const statusBadge = readSource('../StatusBadge/StatusBadge.svelte')

    expect(panel).toContain('var(--surface-panel)')
    expect(panel).toContain('var(--surface-card)')
    expect(panel).toContain('var(--surface-glass)')
    expect(panel).toContain('var(--shadow-surface)')
    expect(panel).toContain('var(--focus-ring)')

    expect(tabList).toContain('role="tablist"')
    expect(tabList).toContain('var(--surface-input)')
    expect(tabButton).toContain('role="tab"')
    expect(tabButton).toContain('aria-selected={active}')

    expect(iconButton).toContain('width: 28px;')
    expect(iconButton).toContain('width: 32px;')
    expect(iconButton).toContain('width: var(--control-height-lg);')

    expect(statusBadge).toContain('var(--state-ai-soft)')
    expect(statusBadge).toContain('var(--state-evidence-soft)')
  })
})
