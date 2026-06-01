import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends HTMLButtonAttributes {
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  children?: Snippet
}
