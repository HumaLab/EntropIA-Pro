import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocumentViewer from '../DocumentViewer.svelte'

type ResizeObserverCallback = globalThis.ResizeObserverCallback

class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  callback: ResizeObserverCallback
  observedTargets = new Set<Element>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe = vi.fn((target: Element) => {
    this.observedTargets.add(target)
  })
  disconnect = vi.fn()

  trigger(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    )
  }
}

vi.stubGlobal('ResizeObserver', MockResizeObserver)

let rafId = 0
let rafQueue: Array<{ id: number; callback: FrameRequestCallback }> = []

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  const id = ++rafId
  rafQueue.push({ id, callback })
  return id
})

vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  rafQueue = rafQueue.filter((entry) => entry.id !== id)
})

// Mock pdfjs-dist for test environment
vi.mock('pdfjs-dist', () => {
  const mockPage = {
    getViewport: vi.fn(() => ({ width: 800, height: 600, scale: 1 })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  }
  const mockDocument = {
    numPages: 3,
    getPage: vi.fn(() => Promise.resolve(mockPage)),
  }
  return {
    getDocument: vi.fn(() => ({ promise: Promise.resolve(mockDocument) })),
    GlobalWorkerOptions: { workerSrc: '' },
  }
})

describe('DocumentViewer', () => {
  beforeEach(() => {
    MockResizeObserver.instances = []
    rafId = 0
    rafQueue = []
  })

  async function flushRaf() {
    const pending = [...rafQueue]
    rafQueue = []
    pending.forEach(({ callback }) => callback(performance.now()))
    await Promise.resolve()
  }

  async function triggerResizeObservers(target: Element) {
    MockResizeObserver.instances.forEach((obs) => obs.trigger(target))
    await flushRaf()
  }

  function setupImage(
    img: HTMLImageElement,
    naturalW: number,
    naturalH: number,
    displayW: number,
    displayH: number
  ) {
    // clientWidth/clientHeight reflect the CSS size (what we set via style)
    Object.defineProperty(img, 'clientWidth', { configurable: true, value: displayW })
    Object.defineProperty(img, 'clientHeight', { configurable: true, value: displayH })
    // naturalWidth/naturalHeight reflect the intrinsic image dimensions
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: naturalW })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: naturalH })
    Object.defineProperty(img, 'complete', { configurable: true, value: true })
    img.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: displayW,
      bottom: displayH,
      width: displayW,
      height: displayH,
      toJSON: () => ({}),
    }))
  }

  function setupContainer(container: HTMLElement, width: number, height: number) {
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
    container.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }))
  }

  describe('image mode', () => {
    it('renders an img element with the asset URL', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })
      const img = screen.getByRole('img')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'asset://localhost/path/to/image.jpg')
    })

    it('renders annotation toolbar in image mode and hides pdf controls', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      expect(screen.getByTestId('annotation-toolbar')).toBeInTheDocument()
      expect(screen.queryByTestId('pdf-controls')).not.toBeInTheDocument()
    })

    it('renders delete selected annotation as the shared trash icon button', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: 'ann-1',
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const deleteBtn = screen.getByRole('button', { name: /delete selected annotation/i })
      expect(deleteBtn.querySelector('svg')).toBeInTheDocument()
      expect(deleteBtn).not.toHaveTextContent('✕')
    })

    it('renders image zoom controls in the top toolbar', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      expect(screen.getByTestId('annotation-toolbar')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
      expect(screen.getByTestId('toolbar-zoom-info')).toHaveTextContent('100%')
    })

    it('uses 10 percent steps and preserves uniform image dimensions when zooming out', async () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const stageSizer = img.parentElement?.parentElement as HTMLElement
      expect(stageSizer.style.width).toBe('200px')
      expect(stageSizer.style.height).toBe('100px')

      await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))

      expect(screen.getByTestId('toolbar-zoom-info')).toHaveTextContent('90%')
      expect(img.style.width).toBe('200px')
      expect(img.style.height).toBe('100px')
      expect(img.parentElement).toHaveStyle({ transform: 'scale(0.9)' })
      expect(stageSizer.style.width).toBe('180px')
      expect(stageSizer.style.height).toBe('90px')
    })

    it('ignores tiny container resize noise and keeps manual zoom composed with fit sizing', async () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      const container = img.closest('.document-viewer__image-container') as HTMLElement
      const stageSizer = img.parentElement?.parentElement as HTMLElement

      setupImage(img, 200, 100, 200, 100)
      setupContainer(container, 300, 240)
      await fireEvent.load(img)
      await triggerResizeObservers(container)

      expect(MockResizeObserver.instances.some((obs) => obs.observedTargets.has(img))).toBe(false)
      expect(MockResizeObserver.instances.some((obs) => obs.observedTargets.has(container))).toBe(
        true
      )
      expect(stageSizer.style.width).toBe('300px')
      expect(stageSizer.style.height).toBe('150px')

      setupContainer(container, 301, 240)
      await triggerResizeObservers(container)

      expect(stageSizer.style.width).toBe('300px')
      expect(stageSizer.style.height).toBe('150px')
      expect(screen.getByTestId('toolbar-zoom-info')).toHaveTextContent('100%')

      await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

      expect(screen.getByTestId('toolbar-zoom-info')).toHaveTextContent('110%')
      expect(stageSizer.style.width).toBe('330px')
      expect(stageSizer.style.height).toBe('165px')
      expect(img.parentElement).toHaveStyle({ transform: 'scale(1.1)' })

      setupContainer(container, 301.4, 240)
      await triggerResizeObservers(container)

      expect(stageSizer.style.width).toBe('330px')
      expect(stageSizer.style.height).toBe('165px')

      setupContainer(container, 280, 240)
      await triggerResizeObservers(container)

      expect(stageSizer.style.width).toBe('308px')
      expect(stageSizer.style.height).toBe('154px')
      expect(img.parentElement).toHaveStyle({ transform: 'scale(1.1)' })
    })

    it('renders layout regions and syncs hover/select callbacks', async () => {
      const onLayoutRegionHoverChange = vi.fn()
      const onLayoutRegionSelect = vi.fn()

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          layoutRegions: [
            {
              id: 'layout-block-1::overlay',
              blockId: 'layout-block-1',
              label: 'title',
              x: 20,
              y: 10,
              width: 80,
              height: 30,
            },
          ],
          showLayoutOverlay: true,
          hoveredLayoutRegionId: 'layout-block-1::overlay',
          selectedLayoutRegionId: null,
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
          onLayoutRegionHoverChange,
          onLayoutRegionSelect,
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const region = await screen.findByTestId('layout-overlay-layout-block-1::overlay')
      expect(region).toHaveAttribute('x', '20')
      expect(region).toHaveAttribute('width', '80')

      await fireEvent.pointerEnter(region)
      expect(onLayoutRegionHoverChange).toHaveBeenCalledWith('layout-block-1::overlay')

      await fireEvent.click(region)
      expect(onLayoutRegionSelect).toHaveBeenCalledWith('layout-block-1::overlay')

      await fireEvent.pointerLeave(region)
      expect(onLayoutRegionHoverChange).toHaveBeenLastCalledWith(null)
    })

    it('keeps selected and hovered layout regions visually separate', async () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          layoutRegions: [
            {
              id: 'layout-block-1::overlay',
              blockId: 'layout-block-1',
              label: 'title',
              x: 20,
              y: 10,
              width: 80,
              height: 30,
            },
            {
              id: 'layout-block-2::overlay',
              blockId: 'layout-block-2',
              label: 'text',
              x: 30,
              y: 60,
              width: 90,
              height: 40,
            },
          ],
          showLayoutOverlay: true,
          hoveredLayoutRegionId: 'layout-block-2::overlay',
          selectedLayoutRegionId: 'layout-block-1::overlay',
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const selectedRegion = await screen.findByTestId('layout-overlay-layout-block-1::overlay')
      const hoveredRegion = await screen.findByTestId('layout-overlay-layout-block-2::overlay')

      expect(selectedRegion).toHaveAttribute('stroke', 'rgb(34, 211, 238)')
      expect(hoveredRegion).toHaveAttribute('stroke', 'rgb(250, 204, 21)')
    })

    it('creates a rectangle annotation with normalized coordinates relative to natural image size', async () => {
      const onAnnotationsChange = vi.fn()

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'rectangle',
          annotationColor: 'var(--color-accent)',
          onAnnotationsChange,
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      // Natural 200x100, displayed at 200x100 (fitScale=1, zoom=1)
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      // Trigger resize observers (image + container)
      await triggerResizeObservers(img)

      const overlay = await screen.findByTestId('annotation-overlay')
      overlay.getBoundingClientRect = vi.fn(() => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      }))

      // Drag from (20,10) to (120,60) on a 200x100 display
      await fireEvent.pointerDown(overlay, { clientX: 20, clientY: 10, button: 0 })
      await fireEvent.pointerMove(overlay, { clientX: 120, clientY: 60, button: 0 })
      await fireEvent.pointerUp(overlay, { clientX: 120, clientY: 60, button: 0 })

      expect(onAnnotationsChange).toHaveBeenCalledTimes(1)
      const created = onAnnotationsChange.mock.calls[0]![0]![0]!
      expect(created.kind).toBe('rectangle')
      // Normalized: 20/200=0.1, 10/100=0.1, 100/200=0.5, 50/100=0.5
      expect(created.x).toBeCloseTo(0.1, 3)
      expect(created.y).toBeCloseTo(0.1, 3)
      expect(created.width).toBeCloseTo(0.5, 3)
      expect(created.height).toBeCloseTo(0.5, 3)
    })

    it('renders annotations in natural-image viewBox coordinates', async () => {
      const annotation = {
        id: 'ann-1',
        assetId: 'asset-1',
        page: 1,
        kind: 'rectangle' as const,
        color: 'var(--color-accent)',
        x: 0.25,
        y: 0.1,
        width: 0.5,
        height: 0.4,
        createdAt: 10,
        updatedAt: 10,
      }

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [annotation],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      // Natural 200x100, displayed at 200x100
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const shape = await screen.findByTestId('annotation-shape-ann-1')
      // ViewBox is "0 0 200 100" → normalized * natural = viewBox px
      expect(shape).toHaveAttribute('x', '50') // 0.25 * 200
      expect(shape).toHaveAttribute('y', '10') // 0.1 * 100
      expect(shape).toHaveAttribute('width', '100') // 0.5 * 200
      expect(shape).toHaveAttribute('height', '40') // 0.4 * 100
    })

    it('keeps annotation positions correct after image resize (zoom stays)', async () => {
      const annotation = {
        id: 'ann-1',
        assetId: 'asset-1',
        page: 1,
        kind: 'rectangle' as const,
        color: 'var(--color-accent)',
        x: 0.25,
        y: 0.1,
        width: 0.5,
        height: 0.4,
        createdAt: 10,
        updatedAt: 10,
      }

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [annotation],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement

      // First: natural 200x100, displayed at 200x100
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const shape = await screen.findByTestId('annotation-shape-ann-1')
      // ViewBox coordinates are always in natural-image space (200x100)
      expect(shape).toHaveAttribute('x', '50')
      expect(shape).toHaveAttribute('y', '10')
      expect(shape).toHaveAttribute('width', '100')
      expect(shape).toHaveAttribute('height', '40')

      // Now resize: same natural image but displayed at 400x200
      setupImage(img, 200, 100, 400, 200)
      await triggerResizeObservers(img)

      await waitFor(() => {
        // ViewBox coords don't change — they're in natural-image space (200x100)
        expect(shape).toHaveAttribute('x', '50')
        expect(shape).toHaveAttribute('y', '10')
        expect(shape).toHaveAttribute('width', '100')
        expect(shape).toHaveAttribute('height', '40')
      })
    })

    it('selects, recolors, deletes, and deselects annotations', async () => {
      const onAnnotationsChange = vi.fn()
      const onSelectedAnnotationIdChange = vi.fn()
      const onAnnotationColorChange = vi.fn()

      const annotation = {
        id: 'ann-1',
        assetId: 'asset-1',
        page: 1,
        kind: 'rectangle' as const,
        color: 'var(--color-accent)',
        x: 0.1,
        y: 0.2,
        width: 0.4,
        height: 0.3,
        createdAt: 10,
        updatedAt: 10,
      }

      const view = render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [annotation],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
          onAnnotationsChange,
          onSelectedAnnotationIdChange,
          onAnnotationColorChange,
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const shape = await screen.findByTestId('annotation-shape-ann-1')
      await fireEvent.click(shape)
      expect(onSelectedAnnotationIdChange).toHaveBeenCalledWith('ann-1')

      await view.rerender({
        path: '/path/to/image.jpg',
        type: 'image',
        assetUrl: 'asset://localhost/path/to/image.jpg',
        annotations: [annotation],
        selectedAnnotationId: 'ann-1',
        annotationTool: 'select',
        annotationColor: 'var(--color-accent)',
        onAnnotationsChange,
        onSelectedAnnotationIdChange,
        onAnnotationColorChange,
      })

      await fireEvent.click(screen.getByRole('button', { name: /warning annotation color/i }))
      expect(onAnnotationColorChange).toHaveBeenCalledWith('var(--color-warning)')
      expect(onAnnotationsChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'ann-1', color: 'var(--color-warning)' }),
      ])

      await fireEvent.click(screen.getByRole('button', { name: /delete selected annotation/i }))
      expect(onAnnotationsChange).toHaveBeenCalledWith([])
      expect(onSelectedAnnotationIdChange).toHaveBeenCalledWith(null)

      const overlay = screen.getByTestId('annotation-overlay')
      overlay.getBoundingClientRect = vi.fn(() => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      }))

      await fireEvent.pointerDown(overlay, { clientX: 199, clientY: 99, button: 0 })
      expect(onSelectedAnnotationIdChange).toHaveBeenLastCalledWith(null)
    })

    it('creates an underline annotation by horizontal drag with fixed stroke', async () => {
      const onAnnotationsChange = vi.fn()

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'underline',
          annotationColor: 'var(--color-accent)',
          onAnnotationsChange,
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const overlay = await screen.findByTestId('annotation-overlay')
      overlay.getBoundingClientRect = vi.fn(() => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      }))

      // Drag from (20,50) to (120,80) — vertical movement ignored for underline
      await fireEvent.pointerDown(overlay, { clientX: 20, clientY: 50, button: 0 })
      await fireEvent.pointerMove(overlay, { clientX: 120, clientY: 80, button: 0 })
      await fireEvent.pointerUp(overlay, { clientX: 120, clientY: 80, button: 0 })

      expect(onAnnotationsChange).toHaveBeenCalledTimes(1)
      const created = onAnnotationsChange.mock.calls[0]![0]![0]!
      expect(created.kind).toBe('underline')
      expect(created.width).toBeCloseTo(0.5, 3) // (120-20)/200 = 0.5
      expect(created.x).toBeCloseTo(0.1, 3) // 20/200 = 0.1
      expect(created.y).toBeCloseTo(0.49, 2) // startY 0.5 - 0.01
      expect(created.height).toBe(0.02)
    })

    it('renders underline annotations with non-scaling stroke', async () => {
      const annotation = {
        id: 'ann-ul',
        assetId: 'asset-1',
        page: 1,
        kind: 'underline' as const,
        color: 'var(--color-accent)',
        x: 0.1,
        y: 0.49,
        width: 0.5,
        height: 0.02,
        createdAt: 10,
        updatedAt: 10,
      }

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [annotation],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      const img = screen.getByRole('img') as HTMLImageElement
      setupImage(img, 200, 100, 200, 100)
      await fireEvent.load(img)
      await triggerResizeObservers(img)

      const line = await screen.findByTestId('annotation-shape-ann-ul')
      // Fixed 2px stroke with non-scaling-stroke
      expect(line).toHaveAttribute('stroke-width', '2')
      expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke')
    })

    it('does not show the select/arrow tool button in the toolbar', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      expect(
        screen.queryByRole('button', { name: /select annotation tool/i })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /rectangle annotation tool/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /underline annotation tool/i })).toBeInTheDocument()
    })

    it('toggles tool off when clicking the already-active tool button', async () => {
      const onAnnotationToolChange = vi.fn()

      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'rectangle',
          annotationColor: 'var(--color-accent)',
          onAnnotationToolChange,
        },
      })

      await fireEvent.click(screen.getByRole('button', { name: /rectangle annotation tool/i }))
      expect(onAnnotationToolChange).toHaveBeenCalledWith('select')
    })

    it('collapses and expands the toolbar', async () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      expect(screen.getByTestId('annotation-toolbar')).toBeInTheDocument()

      await fireEvent.click(screen.getByRole('button', { name: /collapse annotation toolbar/i }))

      expect(screen.queryByTestId('annotation-toolbar')).not.toBeInTheDocument()
      expect(screen.getByTestId('annotation-toolbar-fab')).toBeInTheDocument()

      await fireEvent.click(screen.getByTestId('annotation-toolbar-fab'))

      expect(screen.getByTestId('annotation-toolbar')).toBeInTheDocument()
      expect(screen.queryByTestId('annotation-toolbar-fab')).not.toBeInTheDocument()
    })
  })

  describe('pdf mode', () => {
    it('renders a canvas element for PDF', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })
      const canvas = screen.getByTestId('pdf-canvas')
      expect(canvas).toBeInTheDocument()
    })

    it('renders PDF navigation and zoom controls in the top toolbar', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })
      expect(screen.getByTestId('pdf-toolbar')).toBeInTheDocument()
      expect(screen.getByTestId('pdf-prev')).toBeInTheDocument()
      expect(screen.getByTestId('pdf-next')).toBeInTheDocument()
      expect(screen.getByTestId('pdf-zoom-in')).toBeInTheDocument()
      expect(screen.getByTestId('pdf-zoom-out')).toBeInTheDocument()
    })

    it('uses 10 percent steps for pdf zoom controls', async () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      await waitFor(() => {
        expect(screen.getByTestId('pdf-zoom-info')).toHaveTextContent('100%')
      })

      await fireEvent.click(screen.getByTestId('pdf-zoom-in'))
      expect(screen.getByTestId('pdf-zoom-info')).toHaveTextContent('110%')

      await fireEvent.click(screen.getByTestId('pdf-zoom-out'))
      expect(screen.getByTestId('pdf-zoom-info')).toHaveTextContent('100%')
    })

    it('shows loading state initially', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })
      expect(screen.getByTestId('pdf-loading')).toBeInTheDocument()
    })

    it('prev button is disabled on first page', () => {
      render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })
      expect(screen.getByTestId('pdf-prev')).toBeDisabled()
    })

    it('keeps annotation controls inactive for PDFs', () => {
      const onAnnotationsChange = vi.fn()

      render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'rectangle',
          annotationColor: 'var(--color-accent)',
          onAnnotationsChange,
        },
      })

      expect(screen.queryByTestId('annotation-toolbar')).not.toBeInTheDocument()
      expect(screen.queryByTestId('annotation-overlay')).not.toBeInTheDocument()
      expect(onAnnotationsChange).not.toHaveBeenCalled()
    })

    it('shows PDF loading state when transitioning from image to pdf', async () => {
      const view = render(DocumentViewer, {
        props: {
          path: '/path/to/image.jpg',
          type: 'image',
          assetUrl: 'asset://localhost/path/to/image.jpg',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      expect(screen.queryByTestId('pdf-loading')).not.toBeInTheDocument()

      await view.rerender({
        path: '/path/to/doc.pdf',
        type: 'pdf',
        assetUrl: 'asset://localhost/path/to/doc.pdf',
        annotations: [],
        selectedAnnotationId: null,
        annotationTool: 'select',
        annotationColor: 'var(--color-accent)',
      })

      expect(screen.getByTestId('pdf-loading')).toBeInTheDocument()
    })

    it('hides PDF-only UI when transitioning from pdf to image', async () => {
      const view = render(DocumentViewer, {
        props: {
          path: '/path/to/doc.pdf',
          type: 'pdf',
          assetUrl: 'asset://localhost/path/to/doc.pdf',
          annotations: [],
          selectedAnnotationId: null,
          annotationTool: 'select',
          annotationColor: 'var(--color-accent)',
        },
      })

      expect(screen.getByTestId('pdf-toolbar')).toBeInTheDocument()

      await view.rerender({
        path: '/path/to/image.jpg',
        type: 'image',
        assetUrl: 'asset://localhost/path/to/image.jpg',
        annotations: [],
        selectedAnnotationId: null,
        annotationTool: 'select',
        annotationColor: 'var(--color-accent)',
      })

      expect(screen.getByRole('img')).toHaveAttribute('src', 'asset://localhost/path/to/image.jpg')
      expect(screen.queryByTestId('pdf-toolbar')).not.toBeInTheDocument()
      expect(screen.queryByTestId('pdf-loading')).not.toBeInTheDocument()
    })
  })
})
