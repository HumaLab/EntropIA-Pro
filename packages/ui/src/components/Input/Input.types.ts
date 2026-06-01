export type InputType = 'text' | 'password' | 'search' | 'email'

export interface InputProps {
  value?: string
  type?: InputType
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
  hint?: string
}
