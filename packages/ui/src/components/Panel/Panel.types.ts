import type { Snippet } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'

export type PanelVariant = 'default' | 'raised' | 'glass' | 'sunken'
export type PanelPadding = 'none' | 'sm' | 'md' | 'lg'

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant
  padding?: PanelPadding
  hoverable?: boolean
  active?: boolean
  children?: Snippet
}
