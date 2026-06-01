<script lang="ts">
  let {
    type = 'image',
    currentPage = 1,
    annotations = [],
    layoutRegions = [],
    labels,
    hoveredLayoutRegionId = null,
    selectedLayoutRegionId = null,
    selectedAnnotationId = null,
    annotationTool = 'select',
    annotationColor = 'var(--color-accent)',
    onPageChange = () => {},
    onAnnotationsChange = () => {},
    onLayoutRegionHoverChange = () => {},
    onLayoutRegionSelect = () => {},
    onSelectedAnnotationIdChange = () => {},
    onAnnotationToolChange = () => {},
    onAnnotationColorChange = () => {},
  } = $props()

  function createDraftAnnotation() {
    return {
      id: crypto.randomUUID(),
      assetId: '',
      page: 1,
      kind: 'rectangle',
      color: annotationColor,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      createdAt: 1,
      updatedAt: 1,
    }
  }
</script>

<div data-testid="mock-document-viewer">
  <p data-testid="viewer-type">{type}</p>
  <p data-testid="viewer-annotation-count">{annotations.length}</p>
  <p data-testid="viewer-layout-region-count">{layoutRegions.length}</p>
  <p data-testid="viewer-current-page">{currentPage}</p>
  <p data-testid="viewer-hovered-layout-region">{hoveredLayoutRegionId ?? 'none'}</p>
  <p data-testid="viewer-selected-layout-region">{selectedLayoutRegionId ?? 'none'}</p>
  <p data-testid="viewer-selected-annotation">{selectedAnnotationId ?? 'none'}</p>
  <p data-testid="viewer-annotation-tool">{annotationTool}</p>
  <p data-testid="viewer-annotation-color">{annotationColor}</p>

  <button
    type="button"
    onclick={() => onAnnotationsChange([...annotations, createDraftAnnotation()])}
  >
    Add annotation
  </button>
  <button
    type="button"
    onclick={() => onSelectedAnnotationIdChange(annotations[0]?.id ?? 'missing-annotation')}
  >
    Select annotation
  </button>
  <button type="button" onclick={() => onLayoutRegionHoverChange(layoutRegions[0]?.id ?? null)}>
    Hover first layout region
  </button>
  <button type="button" onclick={() => onLayoutRegionHoverChange(null)}>
    Clear layout hover
  </button>
  <button
    type="button"
    onclick={() =>
      onLayoutRegionSelect(layoutRegions[1]?.id ?? layoutRegions[0]?.id ?? 'missing-layout-region')}
  >
    Select second layout region
  </button>
  <button type="button" aria-label="Go to page 2" onclick={() => onPageChange(2, 2)}>
    Go to page 2
  </button>
  <button type="button" onclick={() => onAnnotationToolChange('rectangle')}>Rectangle tool</button>
  <button type="button" onclick={() => onAnnotationColorChange('var(--color-warning)')}>
    Warning color
  </button>
</div>
