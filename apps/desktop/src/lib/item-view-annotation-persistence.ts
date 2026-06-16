import type { Annotation as StoreAnnotation } from '@entropia/store'
import type { AnnotationKind as ViewerAnnotationKind, ViewerAnnotation } from '@entropia/ui'

type Timer = ReturnType<typeof setTimeout>

export type AnnotationPersistenceInput = Pick<
  ViewerAnnotation,
  'kind' | 'color' | 'x' | 'y' | 'width' | 'height'
>

export interface PendingAnnotationSave {
  assetId: string
  annotations: ViewerAnnotation[]
}

export type AnnotationFinder = (assetId: string, page: number) => Promise<StoreAnnotation[]>

export function toAnnotationPersistenceInputs(
  annotations: ViewerAnnotation[]
): AnnotationPersistenceInput[] {
  return annotations.map((annotation) => ({
    kind: annotation.kind,
    color: annotation.color,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  }))
}

export function toViewerAnnotations(annotations: StoreAnnotation[]): ViewerAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    kind: annotation.kind as ViewerAnnotationKind,
  }))
}

export async function loadViewerAnnotationsForAsset(
  assetId: string,
  findByAsset: AnnotationFinder
): Promise<ViewerAnnotation[]> {
  return toViewerAnnotations(await findByAsset(assetId, 1))
}

export class DebouncedAnnotationPersistor {
  private timer: Timer | null = null
  private pendingSave: PendingAnnotationSave | null = null

  constructor(
    private readonly options: {
      delayMs: number
      persist: (assetId: string, annotations: ViewerAnnotation[]) => Promise<void>
      onError?: (error: unknown) => void
    }
  ) {}

  schedule(assetId: string, annotations: ViewerAnnotation[]) {
    this.clearTimer()
    this.pendingSave = { assetId, annotations }

    this.timer = setTimeout(async () => {
      const saveJob = this.pendingSave
      this.pendingSave = null
      this.timer = null

      if (!saveJob) {
        return
      }

      try {
        await this.options.persist(saveJob.assetId, saveJob.annotations)
      } catch (error) {
        this.options.onError?.(error)
      }
    }, this.options.delayMs)
  }

  async flushPending() {
    this.clearTimer()

    if (!this.pendingSave) {
      return
    }

    const saveJob = this.pendingSave
    this.pendingSave = null
    try {
      await this.options.persist(saveJob.assetId, saveJob.annotations)
    } catch (error) {
      this.options.onError?.(error)
    }
  }

  getPendingAssetId() {
    return this.pendingSave?.assetId ?? null
  }

  cancelAll() {
    this.clearTimer()
    this.pendingSave = null
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
