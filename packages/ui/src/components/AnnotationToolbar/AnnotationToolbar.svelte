<script lang="ts">
  import ActionIcon from '../Button/ActionIcon.svelte'
  import type { AnnotationTool, EditTool } from '../DocumentViewer/DocumentViewer.types'

  export interface AnnotationColorOption {
    value: string
    label: string
  }

  interface AnnotationToolbarProps {
    tool: AnnotationTool
    editTool: EditTool
    color: string
    hasSelection: boolean
    canUndo?: boolean
    colors: AnnotationColorOption[]
    onToolChange?: (tool: AnnotationTool) => void
    onEditToolChange?: (tool: EditTool) => void
    onColorChange?: (color: string) => void
    onDeleteSelected?: () => void
    onRotateLeft?: () => void
    onRotateRight?: () => void
    onUndo?: () => void
    zoomPercent?: number | null
    canZoomOut?: boolean
    canZoomIn?: boolean
    onZoomOut?: () => void
    onZoomIn?: () => void
    labels?: Partial<AnnotationToolbarLabels>
  }

  interface AnnotationToolbarLabels {
    expandToolbar: string
    expandToolbarTitle: string
    collapseToolbar: string
    collapseToolbarTitle: string
    toolbarAriaLabel: string
    undo: string
    undoTitle: string
    rectangleTool: string
    underlineTool: string
    cropTool: string
    eraseTool: string
    rotateLeft: string
    rotateRight: string
    zoomOut: string
    zoomIn: string
    deleteSelected: string
    colorAriaLabel: (label: string) => string
  }

  const defaultLabels: AnnotationToolbarLabels = {
    expandToolbar: 'Expand annotation toolbar',
    expandToolbarTitle: 'Expand toolbar',
    collapseToolbar: 'Collapse annotation toolbar',
    collapseToolbarTitle: 'Collapse toolbar',
    toolbarAriaLabel: 'Image editing tools',
    undo: 'Undo last edit',
    undoTitle: 'Undo',
    rectangleTool: 'Rectangle annotation tool',
    underlineTool: 'Underline annotation tool',
    cropTool: 'Crop to selection',
    eraseTool: 'Erase region (white fill)',
    rotateLeft: 'Rotate 90° left',
    rotateRight: 'Rotate 90° right',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    deleteSelected: 'Delete selected annotation',
    colorAriaLabel: (label: string) => `${label} annotation color`,
  }

  let {
    tool,
    editTool,
    color,
    hasSelection,
    canUndo = false,
    colors,
    onToolChange = () => {},
    onEditToolChange = () => {},
    onColorChange = () => {},
    onDeleteSelected = () => {},
    onRotateLeft = () => {},
    onRotateRight = () => {},
    onUndo = () => {},
    zoomPercent = null,
    canZoomOut = false,
    canZoomIn = false,
    onZoomOut = () => {},
    onZoomIn = () => {},
    labels: labelsProp = {},
  }: AnnotationToolbarProps = $props()

  const labels = $derived({ ...defaultLabels, ...labelsProp })

  let collapsed = $state(false)

  const toolOptions = $derived.by(
    (): Array<{
      value: Exclude<AnnotationTool, 'select'>
      label: string
      short: string
    }> => [
      { value: 'rectangle', label: labels.rectangleTool, short: '▭' },
      { value: 'underline', label: labels.underlineTool, short: '▁' },
    ]
  )

  const editToolOptions = $derived.by(
    (): Array<{
      value: Exclude<EditTool, 'none'>
      label: string
      short?: string
    }> => [
      { value: 'crop', label: labels.cropTool, short: '✂' },
      { value: 'erase', label: labels.eraseTool },
    ]
  )

  function handleToolClick(option: (typeof toolOptions)[number]) {
    if (tool === option.value) {
      onToolChange('select')
    } else {
      onToolChange(option.value)
    }
  }

  function handleEditToolClick(option: (typeof editToolOptions)[number]) {
    if (editTool === option.value) {
      onEditToolChange('none')
    } else {
      onEditToolChange(option.value)
    }
  }
</script>

{#if collapsed}
  <button
    type="button"
    class="annotation-toolbar__fab"
    data-testid="annotation-toolbar-fab"
    aria-label={labels.expandToolbar}
    title={labels.expandToolbarTitle}
    onclick={() => (collapsed = false)}
  >
    ✎
  </button>
{:else}
  <div
    class="annotation-toolbar"
    data-testid="annotation-toolbar"
    role="toolbar"
    aria-label={labels.toolbarAriaLabel}
  >
    <div class="annotation-toolbar__group">
      <button
        type="button"
        class="annotation-toolbar__button"
        aria-label={labels.undo}
        title={labels.undoTitle}
        disabled={!canUndo}
        onclick={onUndo}
      >
        ↶
      </button>

      <span class="annotation-toolbar__separator"></span>

      {#each toolOptions as option (option.value)}
        <button
          type="button"
          class="annotation-toolbar__button"
          class:annotation-toolbar__button--active={tool === option.value}
          aria-label={option.label}
          aria-pressed={tool === option.value}
          title={option.label}
          onclick={() => handleToolClick(option)}
        >
          {option.short}
        </button>
      {/each}

      <span class="annotation-toolbar__separator"></span>

      {#each editToolOptions as option (option.value)}
        <button
          type="button"
          class="annotation-toolbar__button"
          class:annotation-toolbar__button--active={editTool === option.value}
          aria-label={option.label}
          aria-pressed={editTool === option.value}
          title={option.label}
          onclick={() => handleEditToolClick(option)}
        >
          {#if option.value === 'erase'}
            <svg
              class="annotation-toolbar__icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M3 15.5 12.5 6a2 2 0 0 1 2.8 0l4.7 4.7a2 2 0 0 1 0 2.8L13.5 20H8z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <path
                d="M11 19.5h10"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="m9 18 7-7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          {:else}
            {option.short}
          {/if}
        </button>
      {/each}

      <span class="annotation-toolbar__separator"></span>

      <button
        type="button"
        class="annotation-toolbar__button"
        aria-label={labels.rotateLeft}
        title={labels.rotateLeft}
        onclick={onRotateLeft}
      >
        ↺
      </button>

      <button
        type="button"
        class="annotation-toolbar__button"
        aria-label={labels.rotateRight}
        title={labels.rotateRight}
        onclick={onRotateRight}
      >
        ↻
      </button>

      {#if zoomPercent !== null}
        <span class="annotation-toolbar__separator"></span>

        <button
          type="button"
          class="annotation-toolbar__button"
          aria-label={labels.zoomOut}
          title={labels.zoomOut}
          disabled={!canZoomOut}
          onclick={onZoomOut}
        >
          <svg
            class="annotation-toolbar__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M16 16 21 21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M8.5 11h5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <span class="annotation-toolbar__zoom" data-testid="toolbar-zoom-info">{zoomPercent}%</span>

        <button
          type="button"
          class="annotation-toolbar__button"
          aria-label={labels.zoomIn}
          title={labels.zoomIn}
          disabled={!canZoomIn}
          onclick={onZoomIn}
        >
          <svg
            class="annotation-toolbar__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M16 16 21 21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M8.5 11h5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M11 8.5v5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      {/if}
    </div>

    <div class="annotation-toolbar__group">
      {#each colors as option (option.value)}
        <button
          type="button"
          class="annotation-toolbar__swatch"
          class:annotation-toolbar__swatch--active={color === option.value}
          aria-label={labels.colorAriaLabel(option.label)}
          aria-pressed={color === option.value}
          title={option.label}
          onclick={() => onColorChange(option.value)}
        >
          <span class="annotation-toolbar__swatch-fill" style={`background:${option.value}`}></span>
        </button>
      {/each}
    </div>

    <button
      type="button"
      class="annotation-toolbar__button annotation-toolbar__button--danger"
      aria-label={labels.deleteSelected}
      title={labels.deleteSelected}
      disabled={!hasSelection}
      onclick={onDeleteSelected}
    >
      <ActionIcon name="delete" size={18} />
    </button>

    <button
      type="button"
      class="annotation-toolbar__button annotation-toolbar__button--collapse"
      aria-label={labels.collapseToolbar}
      title={labels.collapseToolbarTitle}
      onclick={() => (collapsed = true)}
    >
      ›
    </button>
  </div>
{/if}

<style>
  .annotation-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-surface-raised) 92%, transparent);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(10px);
    pointer-events: auto;
  }

  .annotation-toolbar__fab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-raised) 90%, transparent);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--font-size-md);
    line-height: 1;
    pointer-events: auto;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .annotation-toolbar__fab:hover {
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
  }

  .annotation-toolbar__group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .annotation-toolbar__separator {
    width: 1px;
    height: 20px;
    background-color: var(--color-border);
    margin: 0 var(--space-1);
  }

  .annotation-toolbar__zoom {
    min-width: 52px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .annotation-toolbar__button,
  .annotation-toolbar__swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .annotation-toolbar__button:hover:not(:disabled),
  .annotation-toolbar__swatch:hover:not(:disabled) {
    background: var(--color-surface-raised);
    border-color: var(--color-text-secondary);
  }

  .annotation-toolbar__icon {
    width: 18px;
    height: 18px;
    display: block;
  }

  .annotation-toolbar__button:disabled,
  .annotation-toolbar__swatch:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .annotation-toolbar__button--active,
  .annotation-toolbar__swatch--active {
    border-color: var(--color-accent);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }

  .annotation-toolbar__button--danger:disabled {
    border-color: var(--color-border);
  }

  .annotation-toolbar__button--danger:not(:disabled) {
    color: var(--color-danger);
  }

  .annotation-toolbar__button--collapse {
    color: var(--color-text-secondary);
    font-size: var(--font-size-lg);
  }

  .annotation-toolbar__button--collapse:hover {
    color: var(--color-text-primary);
  }

  .annotation-toolbar__swatch-fill {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    border: 1px solid color-mix(in srgb, var(--color-text-primary) 35%, transparent);
  }

  @media (max-width: 720px) {
    .annotation-toolbar {
      flex-wrap: wrap;
    }
  }
</style>
