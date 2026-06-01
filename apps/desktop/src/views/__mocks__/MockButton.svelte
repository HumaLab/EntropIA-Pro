<script lang="ts">
  import type { ButtonProps } from '@entropia/ui'

  let { children, ...rest }: ButtonProps = $props()
</script>

<button {...rest}>
  {#if children}
    {@render children()}
  {/if}
</button>
