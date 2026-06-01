<script lang="ts">
  import AnnotationToolbar from '../AnnotationToolbar/AnnotationToolbar.svelte'
  import AudioPlayer from '../AudioPlayer/AudioPlayer.svelte'
  import type { DocumentViewerLabels, DocumentViewerProps } from './DocumentViewer.types'
  import type { AnnotationTool, EditTool, ViewerAnnotation } from './DocumentViewer.types'

  let {
    path: _path,
    type,
    assetUrl,
    annotations = [],
    layoutRegions = [],
    showLayoutOverlay = false,
    selectedAnnotationId = null,
    hoveredLayoutRegionId = null,
    selectedLayoutRegionId = null,
    annotationTool = 'select',
    annotationColor = 'var(--color-accent)',
    editTool = 'none',
    canUndo = false,
    currentPage = 1,
    layoutReferenceWidth = 0,
    layoutReferenceHeight = 0,
    onAnnotationsChange = () => {},
    onSelectedAnnotationIdChange = () => {},
    onLayoutRegionHoverChange = () => {},
    onLayoutRegionSelect = () => {},
    onAnnotationToolChange = () => {},
    onAnnotationColorChange = () => {},
    onEditSelect = () => {},
    onEditToolChange = () => {},
    onRotateLeft = () => {},
    onRotateRight = () => {},
    onUndo = () => {},
    onPageChange = () => {},
    onDimensionsChange = () => {},
    labels: labelsProp = {},
    annotationToolbarLabels = {},
  }: DocumentViewerProps = $props()

  const defaultLabels: DocumentViewerLabels = {
    imageAlt: 'Document',
    imageOverlayAriaLabel: 'Image annotation overlay',
    audioSkipBack: 'Skip back 5 seconds',
    audioPlay: 'Play',
    audioPause: 'Pause',
    audioSkipForward: 'Skip forward 5 seconds',
    audioSeek: 'Seek',
    audioVolume: 'Volume',
    pdfLoading: 'Loading PDF...',
    pdfLoadError: 'Failed to load PDF',
    pdfRenderError: 'Failed to render page',
    pdfPreviousPage: 'Previous page',
    pdfNextPage: 'Next page',
    pdfZoomOut: 'Zoom out',
    pdfZoomIn: 'Zoom in',
    layoutOverlayAriaLabel: 'Document layout overlay',
    layoutRegionAriaLabel: (label: string) => `Layout region ${label}`,
    annotationAriaLabel: (id: string) => `Select annotation ${id}`,
    cropRegionAriaLabel: 'Crop region',
    eraseRegionAriaLabel: 'Erase region',
  }

  const labels = $derived({ ...defaultLabels, ...labelsProp })

  const presetColors = [
    { value: 'var(--color-accent)', label: 'Accent' },
    { value: 'var(--color-success)', label: 'Success' },
    { value: 'var(--color-warning)', label: 'Warning' },
    { value: 'var(--color-danger)', label: 'Danger' },
  ]
  const MIN_DRAW_PX = 6
  const UNDERLINE_STROKE_PX = 2
  const UNDERLINE_HITBOX_NORMALIZED = 0.02
  const MIN_ZOOM = 0.4
  const MAX_ZOOM = 3.0
  const ZOOM_STEP = 0.1
  const SIZE_DEADBAND_PX = 1.5

  // PDF state
  let pdfPage = $state(1)
  let totalPages = $state(0)
  let pdfZoom = $state(1.0)
  let loading = $state(false)
  let error = $state<string | null>(null)

  let canvasEl: HTMLCanvasElement | undefined = $state()
  let imgEl: HTMLImageElement | undefined = $state()
  let containerEl: HTMLElement | undefined = $state()
  let pdfDoc: any = null
  let pdfCanvasW = $state(0)
  let pdfCanvasH = $state(0)

  // Image geometry — natural (intrinsic) dimensions of the source file
  let naturalW = $state(0)
  let naturalH = $state(0)

  // Container inner dimensions (content area, padding excluded)
  let containerW = $state(0)
  let containerH = $state(0)

  // Manual zoom multiplier applied on top of auto-fit sizing.
  let imageZoom = $state(1.0)
  let containerMeasureFrame = $state<number | null>(null)

  let draft = $state<{
    startX: number
    startY: number
    currentX: number
    currentY: number
    kind: Exclude<AnnotationTool, 'select'>
  } | null>(null)

  // Edit draft: temporary rectangle drawn while crop/erase is active
  let editDraft = $state<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)

  // ── Derived geometry ──────────────────────────────────────────────
  // fitScale: the scale that makes the image fit inside the container
  const fitScale = $derived(
    naturalW > 0 && naturalH > 0 && containerW > 0 && containerH > 0
      ? Math.min(containerW / naturalW, containerH / naturalH)
      : 1
  )

  // Display dimensions: what the image (and SVG overlay) measure on screen
  const baseDisplayW = $derived(Math.round(naturalW * fitScale))
  const baseDisplayH = $derived(Math.round(naturalH * fitScale))
  const displayW = $derived(Math.round(baseDisplayW * imageZoom))
  const displayH = $derived(Math.round(baseDisplayH * imageZoom))

  const hasRenderableBounds = $derived(naturalW > 0 && naturalH > 0)

  const canZoomIn = $derived(imageZoom < MAX_ZOOM - 0.001)
  const canZoomOut = $derived(imageZoom > MIN_ZOOM + 0.001)

  const canGoPrev = $derived(pdfPage > 1)
  const canGoNext = $derived(pdfPage < totalPages)
  const canPdfZoomIn = $derived(pdfZoom < MAX_ZOOM - 0.001)
  const canPdfZoomOut = $derived(pdfZoom > MIN_ZOOM + 0.001)

  const overlayCursor = $derived(
    editTool !== 'none' ? 'crosshair' : annotationTool === 'select' ? 'default' : 'crosshair'
  )

  const layoutOverlayInteractive = $derived(annotationTool === 'select' && editTool === 'none')
  const layoutViewportW = $derived(type === 'image' ? naturalW : layoutReferenceWidth)
  const layoutViewportH = $derived(type === 'image' ? naturalH : layoutReferenceHeight)
  const layoutDisplayW = $derived(type === 'image' ? displayW : pdfCanvasW)
  const layoutDisplayH = $derived(type === 'image' ? displayH : pdfCanvasH)
  const canRenderLayoutOverlay = $derived(
    showLayoutOverlay &&
      layoutRegions.length > 0 &&
      layoutViewportW > 0 &&
      layoutViewportH > 0 &&
      layoutDisplayW > 0 &&
      layoutDisplayH > 0 &&
      type !== 'audio'
  )

  // ── Helpers ────────────────────────────────────────────────────────
  function clamp01(value: number) {
    return Math.max(0, Math.min(1, value))
  }

  function round(value: number) {
    return Number(value.toFixed(4))
  }

  function clampZoom(value: number) {
    return Number(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)).toFixed(2))
  }

  function readPx(value: string) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  function isPracticallyEqual(next: number, prev: number, epsilon = SIZE_DEADBAND_PX) {
    return Math.abs(next - prev) < epsilon
  }

  function createLocalAnnotation(
    nextTool: Exclude<AnnotationTool, 'select'>,
    x: number,
    y: number,
    width: number,
    height: number
  ): ViewerAnnotation {
    const now = Date.now()
    return {
      id: crypto.randomUUID(),
      assetId: '',
      page: 1,
      kind: nextTool,
      color: annotationColor,
      x,
      y,
      width,
      height,
      createdAt: now,
      updatedAt: now,
    }
  }

  /** Convert normalized [0,1] → natural-image pixels (SVG viewBox space) */
  function px(value: number, axis: 'x' | 'y') {
    const dimension = axis === 'x' ? naturalW : naturalH
    return Math.round(value * dimension)
  }

  /** Convert a viewport PointerEvent to normalized [0,1] coordinates.
   *  Uses getBoundingClientRect which accounts for CSS transforms, so this
   *  works correctly at any zoom level. */
  function getNormalizedPoint(event: PointerEvent) {
    const target = event.currentTarget as SVGSVGElement
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null

    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    }
  }

  function toDraftBox(currentDraft: NonNullable<typeof draft>) {
    const x = Math.min(currentDraft.startX, currentDraft.currentX)
    const y = Math.min(currentDraft.startY, currentDraft.currentY)
    return {
      x: round(x),
      y: round(y),
      width: round(Math.abs(currentDraft.currentX - currentDraft.startX)),
      height: round(Math.abs(currentDraft.currentY - currentDraft.startY)),
    }
  }

  function meetsMinimumSize(box: { width: number; height: number }, kind: AnnotationTool) {
    // Minimum size in display pixels, converted to normalized coords via display dimensions
    const minNormW = MIN_DRAW_PX / Math.max(displayW, 1)
    const minNormH = MIN_DRAW_PX / Math.max(displayH, 1)
    if (kind === 'underline') {
      return box.width >= minNormW
    }
    return box.width >= minNormW && box.height >= minNormH
  }

  // ── Edit draft helpers ───────────────────────────────────────────────
  function toEditBox(d: NonNullable<typeof editDraft>) {
    const x = Math.min(d.startX, d.currentX)
    const y = Math.min(d.startY, d.currentY)
    return {
      x: round(x),
      y: round(y),
      width: round(Math.abs(d.currentX - d.startX)),
      height: round(Math.abs(d.currentY - d.startY)),
    }
  }

  // ── Measurement ────────────────────────────────────────────────────
  function measureImage() {
    if (!imgEl) return
    // Skip measurement if the image hasn't loaded yet (e.g. after {#key} re-creation).
    // This preserves the previous dimensions until onload fires, avoiding a flash
    // where the overlay disappears because naturalWidth/naturalHeight are 0.
    if (!imgEl.complete || imgEl.naturalWidth === 0) return
    const nextNaturalW = imgEl.naturalWidth
    const nextNaturalH = imgEl.naturalHeight

    if (nextNaturalW === naturalW && nextNaturalH === naturalH) return

    naturalW = nextNaturalW
    naturalH = nextNaturalH
    onDimensionsChange({ width: nextNaturalW, height: nextNaturalH })
  }

  function measureContainer() {
    if (!containerEl) return
    const style = getComputedStyle(containerEl)
    const padX = readPx(style.paddingLeft) + readPx(style.paddingRight)
    const padY = readPx(style.paddingTop) + readPx(style.paddingBottom)
    const rect = containerEl.getBoundingClientRect()
    const nextContainerW = Math.max(0, Number((rect.width - padX).toFixed(2)))
    const nextContainerH = Math.max(0, Number((rect.height - padY).toFixed(2)))

    const widthChanged = !isPracticallyEqual(nextContainerW, containerW)
    const heightChanged = !isPracticallyEqual(nextContainerH, containerH)

    if (!widthChanged && !heightChanged) return

    if (widthChanged) containerW = nextContainerW
    if (heightChanged) containerH = nextContainerH
  }

  function scheduleContainerMeasure() {
    if (containerMeasureFrame !== null) return

    containerMeasureFrame = requestAnimationFrame(() => {
      containerMeasureFrame = null
      measureContainer()
    })
  }

  function cancelScheduledContainerMeasure() {
    if (containerMeasureFrame === null) return
    cancelAnimationFrame(containerMeasureFrame)
    containerMeasureFrame = null
  }

  // ── Handlers ────────────────────────────────────────────────────────
  function handleToolbarToolChange(tool: AnnotationTool) {
    onAnnotationToolChange(tool)
    // Reset edit tool when switching to annotation mode
    if (tool !== 'select') {
      onEditToolChange('none')
    }
    if (tool !== annotationTool) {
      draft = null
    }
  }

  function handleToolbarColorChange(color: string) {
    onAnnotationColorChange(color)
    if (!selectedAnnotationId) return
    onAnnotationsChange(
      annotations.map((a) =>
        a.id === selectedAnnotationId ? { ...a, color, updatedAt: Date.now() } : a
      )
    )
  }

  function getLayoutRegionFill(
    region: (typeof layoutRegions)[number],
    isSelected: boolean,
    isHovered: boolean
  ) {
    if (region.matchSource === 'block') {
      return isSelected
        ? 'rgba(251, 191, 36, 0.24)'
        : isHovered
          ? 'rgba(251, 191, 36, 0.18)'
          : 'rgba(251, 191, 36, 0.08)'
    }

    return isSelected
      ? 'rgba(34, 211, 238, 0.2)'
      : isHovered
        ? 'rgba(250, 204, 21, 0.16)'
        : 'rgba(34, 211, 238, 0.08)'
  }

  function getLayoutRegionStroke(
    region: (typeof layoutRegions)[number],
    isSelected: boolean,
    isHovered: boolean
  ) {
    if (region.matchSource === 'block') {
      return isSelected
        ? 'rgb(245, 158, 11)'
        : isHovered
          ? 'rgb(251, 191, 36)'
          : 'rgba(245, 158, 11, 0.9)'
    }

    return isSelected
      ? 'rgb(34, 211, 238)'
      : isHovered
        ? 'rgb(250, 204, 21)'
        : 'rgba(34, 211, 238, 0.8)'
  }

  function getLayoutRegionStrokeWidth(
    region: (typeof layoutRegions)[number],
    isSelected: boolean,
    isHovered: boolean
  ) {
    if (isSelected) return region.matchSource === 'block' ? 3 : 2.5
    if (isHovered) return region.matchSource === 'block' ? 2.4 : 2
    return region.matchSource === 'block' ? 1.75 : 1.25
  }

  function getLayoutRegionStrokeDasharray(
    region: (typeof layoutRegions)[number],
    isSelected: boolean
  ) {
    if (isSelected) {
      return region.matchSource === 'block' ? '10 4' : '0'
    }

    return region.matchSource === 'block' ? '10 6' : '6 4'
  }

  function handleDeleteSelected() {
    if (!selectedAnnotationId) return
    onAnnotationsChange(annotations.filter((a) => a.id !== selectedAnnotationId))
    onSelectedAnnotationIdChange(null)
  }

  function handleOverlayPointerDown(event: PointerEvent) {
    if (!hasRenderableBounds || event.button !== 0) return
    const point = getNormalizedPoint(event)
    if (!point) return

    // Edit mode: start drawing an edit selection rectangle
    if (editTool !== 'none') {
      editDraft = {
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      }
      return
    }

    if (annotationTool === 'select') {
      onSelectedAnnotationIdChange(null)
      return
    }

    draft = {
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      kind: annotationTool,
    }
  }

  function handleOverlayPointerMove(event: PointerEvent) {
    if (editDraft) {
      const point = getNormalizedPoint(event)
      if (!point) return
      editDraft = {
        ...editDraft,
        currentX: point.x,
        currentY: point.y,
      }
      return
    }

    if (!draft) return
    const point = getNormalizedPoint(event)
    if (!point) return
    draft = {
      ...draft,
      currentX: point.x,
      currentY: draft.kind === 'underline' ? draft.startY : point.y,
    }
  }

  function finishDraft() {
    // Handle edit draft completion
    if (editDraft) {
      const box = toEditBox(editDraft)
      editDraft = null
      const minSize = MIN_DRAW_PX / Math.max(displayW, 1)
      const minHeight = MIN_DRAW_PX / Math.max(displayH, 1)
      if (box.width < minSize || box.height < minHeight) return
      onEditSelect({ x: box.x, y: box.y, width: box.width, height: box.height })
      return
    }

    if (!draft) return
    const kind = draft.kind

    if (kind === 'underline') {
      const x = round(Math.min(draft.startX, draft.currentX))
      const width = round(Math.abs(draft.currentX - draft.startX))
      const y = round(clamp01(draft.startY - UNDERLINE_HITBOX_NORMALIZED / 2))
      const minWidth = MIN_DRAW_PX / Math.max(displayW, 1)
      const clampedWidth = round(Math.min(width, 1 - x))

      draft = null
      if (clampedWidth < minWidth) return

      onAnnotationsChange([
        ...annotations,
        createLocalAnnotation('underline', x, y, clampedWidth, UNDERLINE_HITBOX_NORMALIZED),
      ])
      onSelectedAnnotationIdChange(null)
      return
    }

    const box = toDraftBox(draft)
    draft = null
    if (!meetsMinimumSize(box, kind)) return

    onAnnotationsChange([
      ...annotations,
      createLocalAnnotation(kind, box.x, box.y, box.width, box.height),
    ])
    onSelectedAnnotationIdChange(null)
  }

  function handleShapeClick(annotationId: string) {
    onSelectedAnnotationIdChange(annotationId)
  }

  function handleLayoutRegionEnter(regionId: string) {
    onLayoutRegionHoverChange(regionId)
  }

  function handleLayoutRegionLeave() {
    onLayoutRegionHoverChange(null)
  }

  function handleLayoutRegionClick(regionId: string) {
    onLayoutRegionSelect(regionId)
  }

  function handleLayoutRegionKeydown(event: KeyboardEvent, regionId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    handleLayoutRegionClick(regionId)
  }

  function handleShapePointerDown(event: PointerEvent, annotationId: string) {
    event.stopPropagation()
    handleShapeClick(annotationId)
  }
  function handleShapeKeydown(event: KeyboardEvent, annotationId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    handleShapeClick(annotationId)
  }

  // ── Zoom (image) ──────────────────────────────────────────────────
  function imageZoomIn() {
    if (canZoomIn) imageZoom = clampZoom(imageZoom + ZOOM_STEP)
  }
  function imageZoomOut() {
    if (canZoomOut) imageZoom = clampZoom(imageZoom - ZOOM_STEP)
  }

  // ── PDF ─────────────────────────────────────────────────────────────
  function resetViewerState() {
    loading = false
    error = null
    pdfPage = 1
    totalPages = 0
    pdfZoom = 1.0
    pdfDoc = null
    pdfCanvasW = 0
    pdfCanvasH = 0
  }
  function activatePdfMode() {
    loading = true
    error = null
  }

  async function loadPdf() {
    try {
      activatePdfMode()
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href
      const loadingTask = pdfjs.getDocument(assetUrl)
      pdfDoc = await loadingTask.promise
      totalPages = pdfDoc.numPages
      pdfPage = Math.min(Math.max(currentPage, 1), Math.max(pdfDoc.numPages, 1))
      await renderPage()
    } catch (err) {
      error = err instanceof Error ? err.message : labels.pdfLoadError
    } finally {
      loading = false
    }
  }

  async function renderPage() {
    if (!pdfDoc || !canvasEl) return
    try {
      const page = await pdfDoc.getPage(pdfPage)
      const viewport = page.getViewport({ scale: pdfZoom })
      const context = canvasEl.getContext('2d')
      if (!context) return
      canvasEl.width = viewport.width
      canvasEl.height = viewport.height
      pdfCanvasW = viewport.width
      pdfCanvasH = viewport.height
      await page.render({ canvasContext: context, viewport }).promise
      onPageChange(pdfPage, totalPages)
    } catch (err) {
      error = err instanceof Error ? err.message : labels.pdfRenderError
    }
  }

  function prevPage() {
    if (canGoPrev) {
      pdfPage--
      renderPage()
    }
  }
  function nextPage() {
    if (canGoNext) {
      pdfPage++
      renderPage()
    }
  }
  function pdfZoomIn() {
    if (canPdfZoomIn) {
      pdfZoom = clampZoom(pdfZoom + ZOOM_STEP)
      renderPage()
    }
  }
  function pdfZoomOut() {
    if (canPdfZoomOut) {
      pdfZoom = clampZoom(pdfZoom - ZOOM_STEP)
      renderPage()
    }
  }

  // ── Effects ────────────────────────────────────────────────────────
  // Reset image zoom when the asset URL changes (crop, rotate, erase)
  $effect(() => {
    // Depend on assetUrl so zoom resets on every edit
    const _url = assetUrl
    if (type === 'image') {
      imageZoom = 1.0
    }
  })

  $effect(() => {
    if (type !== 'image') {
      naturalW = 0
      naturalH = 0
      return
    }
    if (!imgEl) return // Image element not mounted yet; don't zero dimensions
    measureImage()
  })

  $effect(() => {
    if (type !== 'image' || !containerEl) return
    scheduleContainerMeasure()
    const obs = new ResizeObserver(() => scheduleContainerMeasure())
    obs.observe(containerEl)
    return () => {
      obs.disconnect()
      cancelScheduledContainerMeasure()
    }
  })

  $effect(() => {
    if (type !== 'pdf') {
      resetViewerState()
      return
    }
    activatePdfMode()
    void loadPdf()
  })

  $effect(() => {
    if (type !== 'pdf' || !pdfDoc) {
      return
    }

    const nextPage = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1))
    if (nextPage === pdfPage) {
      return
    }

    pdfPage = nextPage
    void renderPage()
  })

  // ── Draft rendering ─────────────────────────────────────────────────
  const draftBox = $derived(draft ? toDraftBox(draft) : null)
  const draftUnderline = $derived(
    draft?.kind === 'underline'
      ? {
          x1: Math.min(draft.startX, draft.currentX),
          x2: Math.max(draft.startX, draft.currentX),
          y: draft.startY,
        }
      : null
  )
</script>

<div class="document-viewer">
  {#if type === 'image'}
    <!-- svelte-ignore a11y_no_static_element_interactions — overlay needs pointer events -->
    <div class="document-viewer__image-container" bind:this={containerEl}>
      <div class="document-viewer__toolbar-anchor">
        <AnnotationToolbar
          tool={annotationTool}
          {editTool}
          color={annotationColor}
          hasSelection={selectedAnnotationId !== null}
          {canUndo}
          colors={presetColors}
          onToolChange={handleToolbarToolChange}
          {onEditToolChange}
          onColorChange={handleToolbarColorChange}
          onDeleteSelected={handleDeleteSelected}
          {onRotateLeft}
          {onRotateRight}
          {onUndo}
          zoomPercent={Math.round(imageZoom * 100)}
          {canZoomOut}
          {canZoomIn}
          onZoomOut={imageZoomOut}
          onZoomIn={imageZoomIn}
          labels={{
            ...annotationToolbarLabels,
            zoomOut: labels.pdfZoomOut,
            zoomIn: labels.pdfZoomIn,
          }}
        />
      </div>

      <div class="document-viewer__image-stage">
        <div
          class="document-viewer__image-stage-sizer"
          style={`width:${displayW}px;height:${displayH}px;`}
        >
          <div
            class="document-viewer__image-stage-content"
            style={`width:${baseDisplayW}px;height:${baseDisplayH}px;transform: scale(${imageZoom});`}
          >
            {#key assetUrl}
              <img
                bind:this={imgEl}
                src={assetUrl}
                alt={labels.imageAlt}
                class="document-viewer__image"
                style={`width:${baseDisplayW}px;height:${baseDisplayH}px;`}
                onload={measureImage}
              />
            {/key}

            {#if hasRenderableBounds}
              <svg
                class="document-viewer__overlay"
                data-testid="annotation-overlay"
                role="application"
                aria-label={labels.imageOverlayAriaLabel}
                width={baseDisplayW}
                height={baseDisplayH}
                viewBox={`0 0 ${naturalW} ${naturalH}`}
                style={`--overlay-cursor: ${overlayCursor}`}
                onpointerdown={handleOverlayPointerDown}
                onpointermove={handleOverlayPointerMove}
                onpointerup={finishDraft}
                onpointerleave={finishDraft}
              >
                {#if canRenderLayoutOverlay}
                  {#each layoutRegions as region (region.id)}
                    {@const isSelectedRegion = region.id === selectedLayoutRegionId}
                    {@const isHoveredRegion = region.id === hoveredLayoutRegionId}
                    <rect
                      data-testid={`layout-overlay-${region.id}`}
                      class:selected={isSelectedRegion}
                      class:hovered={isHoveredRegion}
                      class="document-viewer__layout-region"
                      x={region.x}
                      y={region.y}
                      width={region.width}
                      height={region.height}
                      fill={getLayoutRegionFill(region, isSelectedRegion, isHoveredRegion)}
                      stroke={getLayoutRegionStroke(region, isSelectedRegion, isHoveredRegion)}
                      stroke-width={getLayoutRegionStrokeWidth(
                        region,
                        isSelectedRegion,
                        isHoveredRegion
                      )}
                      stroke-dasharray={getLayoutRegionStrokeDasharray(region, isSelectedRegion)}
                      vector-effect="non-scaling-stroke"
                      role="button"
                      tabindex="-1"
                      aria-label={labels.layoutRegionAriaLabel(region.label)}
                      style={!layoutOverlayInteractive ? 'pointer-events:none' : ''}
                      onpointerenter={() => handleLayoutRegionEnter(region.id)}
                      onpointerleave={handleLayoutRegionLeave}
                      onclick={(event) => {
                        event.stopPropagation()
                        handleLayoutRegionClick(region.id)
                      }}
                      onkeydown={(event) => handleLayoutRegionKeydown(event, region.id)}
                    />
                  {/each}
                {/if}

                {#each annotations as annotation (annotation.id)}
                  {#if annotation.kind === 'rectangle'}
                    <rect
                      data-testid={`annotation-shape-${annotation.id}`}
                      x={px(annotation.x, 'x')}
                      y={px(annotation.y, 'y')}
                      width={px(annotation.width, 'x')}
                      height={px(annotation.height, 'y')}
                      fill={annotation.color}
                      fill-opacity="0.2"
                      stroke={annotation.id === selectedAnnotationId
                        ? 'var(--color-text-primary)'
                        : annotation.color}
                      stroke-width={annotation.id === selectedAnnotationId ? 2 : 1.5}
                      vector-effect="non-scaling-stroke"
                      style={editTool !== 'none' ? 'pointer-events:none' : ''}
                      role="button"
                      tabindex="-1"
                      aria-label={labels.annotationAriaLabel(annotation.id)}
                      onclick={(event) => {
                        event.stopPropagation()
                        handleShapeClick(annotation.id)
                      }}
                      onkeydown={(event) => handleShapeKeydown(event, annotation.id)}
                      onpointerdown={(event) => handleShapePointerDown(event, annotation.id)}
                    />
                  {:else}
                    <g style={editTool !== 'none' ? 'pointer-events:none' : ''}>
                      <rect
                        data-testid={`annotation-hitbox-${annotation.id}`}
                        x={px(annotation.x, 'x')}
                        y={px(annotation.y, 'y')}
                        width={px(annotation.width, 'x')}
                        height={px(annotation.height, 'y')}
                        fill="transparent"
                        role="button"
                        tabindex="-1"
                        aria-label={labels.annotationAriaLabel(annotation.id)}
                        onclick={(event) => {
                          event.stopPropagation()
                          handleShapeClick(annotation.id)
                        }}
                        onkeydown={(event) => handleShapeKeydown(event, annotation.id)}
                        onpointerdown={(event) => handleShapePointerDown(event, annotation.id)}
                      />
                      <line
                        data-testid={`annotation-shape-${annotation.id}`}
                        x1={px(annotation.x, 'x')}
                        y1={px(annotation.y + annotation.height / 2, 'y')}
                        x2={px(annotation.x + annotation.width, 'x')}
                        y2={px(annotation.y + annotation.height / 2, 'y')}
                        stroke={annotation.id === selectedAnnotationId
                          ? 'var(--color-text-primary)'
                          : annotation.color}
                        stroke-width={UNDERLINE_STROKE_PX}
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                        role="button"
                        tabindex="-1"
                        aria-label={labels.annotationAriaLabel(annotation.id)}
                        onclick={(event) => {
                          event.stopPropagation()
                          handleShapeClick(annotation.id)
                        }}
                        onkeydown={(event) => handleShapeKeydown(event, annotation.id)}
                        onpointerdown={(event) => handleShapePointerDown(event, annotation.id)}
                      />
                    </g>
                  {/if}
                {/each}

                {#if draftBox && draft?.kind === 'rectangle'}
                  <rect
                    x={px(draftBox.x, 'x')}
                    y={px(draftBox.y, 'y')}
                    width={px(draftBox.width, 'x')}
                    height={px(draftBox.height, 'y')}
                    fill={annotationColor}
                    fill-opacity="0.14"
                    stroke={annotationColor}
                    stroke-dasharray="6 4"
                    stroke-width="1.5"
                    vector-effect="non-scaling-stroke"
                  />
                {/if}

                {#if draftUnderline}
                  <line
                    x1={px(draftUnderline.x1, 'x')}
                    y1={px(draftUnderline.y, 'y')}
                    x2={px(draftUnderline.x2, 'x')}
                    y2={px(draftUnderline.y, 'y')}
                    stroke={annotationColor}
                    stroke-width={UNDERLINE_STROKE_PX}
                    stroke-dasharray="6 4"
                    stroke-linecap="round"
                    vector-effect="non-scaling-stroke"
                  />
                {/if}

                {#if editDraft}
                  {@const ebox = toEditBox(editDraft)}
                  {@const isCrop = editTool === 'crop'}
                  {@const editColor = isCrop
                    ? 'var(--color-success, #16a34a)'
                    : 'var(--color-danger, #dc2626)'}
                  {@const editLabel = isCrop
                    ? labels.cropRegionAriaLabel
                    : labels.eraseRegionAriaLabel}
                  {#if ebox.width > 0.001 && ebox.height > 0.001}
                    <rect
                      x={0}
                      y={0}
                      width={naturalW}
                      height={px(ebox.y, 'y')}
                      fill="rgba(0,0,0,0.35)"
                    />
                    <rect
                      x={0}
                      y={px(ebox.y, 'y')}
                      width={px(ebox.x, 'x')}
                      height={px(ebox.height, 'y')}
                      fill="rgba(0,0,0,0.35)"
                    />
                    <rect
                      x={px(ebox.x + ebox.width, 'x')}
                      y={px(ebox.y, 'y')}
                      width={naturalW - px(ebox.x + ebox.width, 'x')}
                      height={px(ebox.height, 'y')}
                      fill="rgba(0,0,0,0.35)"
                    />
                    <rect
                      x={0}
                      y={px(ebox.y + ebox.height, 'y')}
                      width={naturalW}
                      height={naturalH - px(ebox.y + ebox.height, 'y')}
                      fill="rgba(0,0,0,0.35)"
                    />
                  {/if}
                  <rect
                    data-testid="edit-selection-rect"
                    x={px(ebox.x, 'x')}
                    y={px(ebox.y, 'y')}
                    width={px(ebox.width, 'x')}
                    height={px(ebox.height, 'y')}
                    fill={isCrop ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)'}
                    stroke={editColor}
                    stroke-width="2"
                    stroke-dasharray="8 4"
                    vector-effect="non-scaling-stroke"
                    role="img"
                    aria-label={editLabel}
                  />
                {/if}
              </svg>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {:else if type === 'audio'}
    <AudioPlayer
      src={assetUrl}
      labels={{
        skipBack: labels.audioSkipBack,
        play: labels.audioPlay,
        pause: labels.audioPause,
        skipForward: labels.audioSkipForward,
        seek: labels.audioSeek,
        volume: labels.audioVolume,
      }}
    />
  {:else}
    {#if loading}
      <div class="document-viewer__loading" data-testid="pdf-loading">
        <span class="document-viewer__spinner" aria-hidden="true"></span>
        <span>{labels.pdfLoading}</span>
      </div>
    {/if}

    {#if error}
      <div class="document-viewer__error" data-testid="pdf-error" role="alert">{error}</div>
    {/if}

    <div class="document-viewer__pdf-toolbar" data-testid="pdf-toolbar">
      <button
        type="button"
        class="document-viewer__btn"
        data-testid="pdf-prev"
        disabled={!canGoPrev}
        onclick={prevPage}
        aria-label={labels.pdfPreviousPage}
      >
        &#8249;
      </button>
      <span class="document-viewer__page-info" data-testid="pdf-page-info"
        >{pdfPage} / {totalPages}</span
      >
      <span class="document-viewer__separator"></span>
      <button
        type="button"
        class="document-viewer__btn"
        data-testid="pdf-zoom-out"
        disabled={!canPdfZoomOut}
        onclick={pdfZoomOut}
        aria-label={labels.pdfZoomOut}
      >
        <svg
          class="document-viewer__toolbar-icon"
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
      <span class="document-viewer__zoom-info" data-testid="pdf-zoom-info"
        >{Math.round(pdfZoom * 100)}%</span
      >
      <button
        type="button"
        class="document-viewer__btn"
        data-testid="pdf-zoom-in"
        disabled={!canPdfZoomIn}
        onclick={pdfZoomIn}
        aria-label={labels.pdfZoomIn}
      >
        <svg
          class="document-viewer__toolbar-icon"
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
      <span class="document-viewer__separator"></span>
      <button
        type="button"
        class="document-viewer__btn"
        data-testid="pdf-next"
        disabled={!canGoNext}
        onclick={nextPage}
        aria-label={labels.pdfNextPage}
      >
        &#8250;
      </button>
    </div>

    <div class="document-viewer__canvas-container">
      <div class="document-viewer__pdf-stage">
        <canvas bind:this={canvasEl} data-testid="pdf-canvas"></canvas>

        {#if canRenderLayoutOverlay}
          <svg
            class="document-viewer__overlay document-viewer__overlay--layout-only"
            data-testid="layout-overlay"
            aria-label={labels.layoutOverlayAriaLabel}
            width={layoutDisplayW}
            height={layoutDisplayH}
            viewBox={`0 0 ${layoutViewportW} ${layoutViewportH}`}
          >
            {#each layoutRegions as region (region.id)}
              {@const isSelectedRegion = region.id === selectedLayoutRegionId}
              {@const isHoveredRegion = region.id === hoveredLayoutRegionId}
              <rect
                data-testid={`layout-overlay-${region.id}`}
                class:selected={isSelectedRegion}
                class:hovered={isHoveredRegion}
                class="document-viewer__layout-region"
                x={region.x}
                y={region.y}
                width={region.width}
                height={region.height}
                fill={getLayoutRegionFill(region, isSelectedRegion, isHoveredRegion)}
                stroke={getLayoutRegionStroke(region, isSelectedRegion, isHoveredRegion)}
                stroke-width={getLayoutRegionStrokeWidth(region, isSelectedRegion, isHoveredRegion)}
                stroke-dasharray={getLayoutRegionStrokeDasharray(region, isSelectedRegion)}
                vector-effect="non-scaling-stroke"
                role="button"
                tabindex="-1"
                aria-label={labels.layoutRegionAriaLabel(region.label)}
                onpointerenter={() => handleLayoutRegionEnter(region.id)}
                onpointerleave={handleLayoutRegionLeave}
                onclick={() => handleLayoutRegionClick(region.id)}
                onkeydown={(event) => handleLayoutRegionKeydown(event, region.id)}
              />
            {/each}
          </svg>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .document-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .document-viewer__image-container {
    flex: 1;
    overflow: auto;
    scrollbar-gutter: stable both-edges;
    padding: var(--space-4);
    position: relative;
  }

  .document-viewer__toolbar-anchor {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    gap: var(--space-2);
    pointer-events: none;
    padding: 0 var(--space-2) var(--space-2) 0;
  }

  .document-viewer__image-stage {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: auto;
  }

  .document-viewer__image-stage-sizer {
    position: relative;
    flex: 0 0 auto;
  }

  .document-viewer__image-stage-content {
    position: relative;
    transform-origin: top left;
  }

  .document-viewer__image {
    display: block;
    flex-shrink: 0;
  }

  .document-viewer__overlay {
    position: absolute;
    inset: 0;
    cursor: var(--overlay-cursor, crosshair);
  }

  .document-viewer__overlay--layout-only {
    cursor: default;
  }

  .document-viewer__layout-region {
    transition:
      fill 0.15s ease,
      stroke 0.15s ease,
      stroke-width 0.15s ease;
  }

  .document-viewer__canvas-container {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: auto;
    padding: var(--space-4);
  }

  .document-viewer__pdf-stage {
    position: relative;
    display: inline-flex;
    align-items: flex-start;
    justify-content: center;
  }

  .document-viewer__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--color-text-secondary);
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
  }

  .document-viewer__spinner {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: var(--radius-full);
    animation: spin 0.6s linear infinite;
  }

  .document-viewer__error {
    padding: var(--space-4);
    color: var(--color-danger);
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
    text-align: center;
  }

  .document-viewer__pdf-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background-color: var(--color-surface);
    border-top: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .document-viewer__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: transparent;
    color: var(--color-text-primary);
    cursor: pointer;
    font-size: var(--font-size-lg);
    line-height: 1;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .document-viewer__btn:hover:not(:disabled) {
    background-color: var(--color-surface-raised);
    border-color: var(--color-text-muted);
  }

  .document-viewer__toolbar-icon {
    width: 16px;
    height: 16px;
    display: block;
  }

  .document-viewer__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .document-viewer__page-info,
  .document-viewer__zoom-info {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    min-width: 60px;
    text-align: center;
  }

  .document-viewer__separator {
    width: 1px;
    height: 20px;
    background-color: var(--color-border);
    margin: 0 var(--space-2);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
