import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

export type IconButtonSize = 'sm' | 'md' | 'lg'
export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger'

export interface IconButtonProps extends HTMLButtonAttributes {
  variant?: IconButtonVariant
  size?: IconButtonSize
  label: string
  active?: boolean
  children?: Snippet
}
