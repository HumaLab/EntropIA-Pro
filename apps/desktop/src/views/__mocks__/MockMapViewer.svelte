<script lang="ts">
  let { markers = [] } = $props()
</script>

<div data-testid="mock-map-viewer">
  {#each markers as marker (marker.entityId)}
    <div data-testid={`mock-map-marker-${marker.entityId}`}>{marker.label}</div>
  {/each}
</div>
