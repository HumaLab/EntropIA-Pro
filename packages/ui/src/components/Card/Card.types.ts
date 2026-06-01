import type { Snippet } from 'svelte'

export type CardPadding = 'sm' | 'md' | 'lg'

export interface CardProps {
  padding?: CardPadding
  hoverable?: boolean
  header?: Snippet
  children?: Snippet
  footer?: Snippet
}
