<script lang="ts">
  import type { TabListProps } from './Tabs.types'

  let { children, class: className = '', ...rest }: TabListProps = $props()
</script>

<div class="tab-list {className}" role="tablist" {...rest}>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .tab-list {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding: var(--space-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-input);
    background: var(--surface-input);
  }
</style>
