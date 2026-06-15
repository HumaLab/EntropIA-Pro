import type { Snippet } from 'svelte'
import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements'

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  children?: Snippet
}

export interface TabButtonProps extends HTMLButtonAttributes {
  active?: boolean
  children?: Snippet
}
