<script lang="ts">
  import Button from '../Button.svelte'

  let {
    iconOnly = false,
    size = 'md',
    label,
  }: {
    iconOnly?: boolean
    size?: 'sm' | 'md' | 'lg'
    label: string
  } = $props()

  const buttonProps = $derived({
    iconOnly,
    size,
    'aria-label': label,
  } as Record<string, unknown>)
</script>

<Button {...buttonProps}>
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M0 0h24v24H0z" />
  </svg>
</Button>
