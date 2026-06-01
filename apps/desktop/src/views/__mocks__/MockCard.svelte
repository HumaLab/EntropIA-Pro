<script lang="ts">
  let { children } = $props()
</script>

<div data-testid="mock-card">
  {#if children}
    {@render children()}
  {/if}
</div>
