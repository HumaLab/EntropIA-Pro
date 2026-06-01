<script lang="ts">
  let {
    entities = [],
    editingEntityId = null,
    editingValue = '',
    labels,
    onentityclick = () => {},
    onhighlight = () => {},
    oneditvaluechange = () => {},
    onsaveentity = () => {},
    oncancelentityedit = () => {},
    ondeleteentity = () => {},
  } = $props()
</script>

<div data-testid="mock-entity-viewer">
  {#each entities as entity (entity.id)}
    {#if editingEntityId === entity.id}
      <div data-testid={`mock-entity-editing-${entity.id}`}>
        <input
          type="text"
          aria-label={labels?.editValueAria ?? 'Edit entity value'}
          value={editingValue}
          oninput={(event) => oneditvaluechange(event.currentTarget.value)}
          onkeydown={(event) => {
            if (event.key === 'Enter') onsaveentity(entity.id, event.currentTarget.value)
            if (event.key === 'Escape') oncancelentityedit()
          }}
          onblur={(event) => onsaveentity(entity.id, event.currentTarget.value)}
        />
      </div>
    {:else}
      <button
        type="button"
        data-testid={`mock-entity-${entity.id}`}
        onclick={() => {
          if (entity.startOffset != null && entity.endOffset != null) {
            onhighlight({ startOffset: entity.startOffset, endOffset: entity.endOffset })
          }
          onentityclick(entity)
        }}
      >
        {entity.value}
      </button>
      <button
        type="button"
        aria-label={(labels?.deleteEntityAria ?? ((value: string) => `Delete entity ${value}`))(
          entity.value
        )}
        data-testid={`mock-entity-delete-${entity.id}`}
        onclick={() => ondeleteentity(entity.id)}
      >
        delete
      </button>
    {/if}
  {/each}
</div>
