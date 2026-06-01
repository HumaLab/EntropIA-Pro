<script lang="ts">
  import { ActionIcon, Button } from '../Button'
  import type { ItemCardProps } from './ItemCard.types'

  let {
    id: _id,
    title,
    assetCount,
    thumbnailPath,
    primaryAssetType,
    metadataPreview,
    onclick,
    onDelete,
    deleteAriaLabel = `Delete ${title}`,
  }: ItemCardProps = $props()

  const isAudio = $derived(primaryAssetType === 'audio')
  const isPdf = $derived(primaryAssetType === 'pdf')

  const assetLabel = $derived(assetCount === 1 ? 'asset' : 'assets')
  const showDelete = $derived(!!onDelete)
</script>

<div class="item-card">
  <button class="item-card__main" type="button" {onclick}>
    <div class="item-card__thumbnail">
      {#if isAudio}
        <div class="item-card__audio" data-testid="item-audio">
          <svg
            class="item-card__play-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="11"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              opacity="0.3"
            />
            <path d="M9.5 6.5l8 5.5-8 5.5V6.5z" />
          </svg>
        </div>
      {:else if thumbnailPath}
        <img src={thumbnailPath} alt={title} class="item-card__img" />
      {:else if isPdf}
        <div class="item-card__pdf-icon" data-testid="item-pdf-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
      {:else}
        <div class="item-card__placeholder" data-testid="item-placeholder">
          <span class="item-card__placeholder-icon" aria-hidden="true">&#128196;</span>
        </div>
      {/if}
    </div>

    <div class="item-card__content">
      <span class="item-card__title">{title}</span>
      <span class="item-card__chip">{assetCount} {assetLabel}</span>
      {#if metadataPreview}
        <span class="item-card__metadata">{metadataPreview}</span>
      {/if}
    </div>
  </button>

  {#if showDelete}
    <Button
      class="item-card__delete"
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={deleteAriaLabel}
      onclick={(e) => {
        e.stopPropagation()
        onDelete?.(e)
      }}
    >
      <ActionIcon name="delete" />
    </Button>
  {/if}
</div>

<style>
  .item-card {
    display: flex;
    flex-direction: column;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.003) 58%),
      var(--color-surface);
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius-lg);
    transition:
      border-color var(--transition-smooth),
      box-shadow var(--transition-smooth),
      transform var(--transition-smooth);
    overflow: hidden;
    width: 100%;
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    position: relative;
  }

  .item-card:hover,
  .item-card:focus-within {
    border-color: color-mix(in srgb, var(--color-accent) 26%, var(--color-border-strong));
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .item-card:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .item-card__main {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    font-family: inherit;
    color: inherit;
  }

  .item-card__main:focus-visible {
    outline: none;
  }

  .item-card__thumbnail {
    width: 100%;
    height: 120px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 0%, var(--color-accent-faint), transparent 38%),
      var(--color-surface-sunken);
    border-bottom: 1px solid var(--color-hairline);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .item-card__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .item-card__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .item-card__placeholder-icon {
    font-size: 32px;
    opacity: 0.4;
  }

  .item-card__audio {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .item-card__play-icon {
    color: var(--color-text-muted);
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }

  .item-card:hover .item-card__play-icon,
  .item-card:focus-within .item-card__play-icon {
    opacity: 1;
  }

  .item-card__pdf-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .item-card__content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    padding-right: calc(var(--space-3) + var(--control-height-sm) + var(--space-2));
    min-height: calc(var(--control-height-sm) + var(--space-4));
  }

  .item-card__title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .item-card__chip {
    display: inline-block;
    width: fit-content;
    padding: 2px var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-accent-hover);
    background-color: var(--color-accent-faint);
    border: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
    border-radius: var(--radius-full);
  }

  .item-card__metadata {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Delete button overlay */
  :global(.item-card__delete) {
    position: absolute;
    bottom: var(--space-3);
    right: var(--space-2);
    background-color: transparent;
    border-color: transparent;
    color: var(--color-danger);
    box-shadow: none;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      color 0.15s ease,
      background-color 0.15s ease,
      border-color 0.15s ease;
    z-index: 1;
  }

  .item-card:hover :global(.item-card__delete),
  .item-card:focus-within :global(.item-card__delete),
  :global(.item-card__delete:focus-visible) {
    opacity: 1;
  }

  :global(.item-card__delete:hover) {
    background-color: transparent;
    color: var(--color-danger);
    border-color: transparent;
  }

  :global(.item-card__delete:focus-visible) {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }
</style>
