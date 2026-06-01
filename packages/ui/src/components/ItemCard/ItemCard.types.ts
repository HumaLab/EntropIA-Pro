export type AssetType = 'image' | 'pdf' | 'audio'

export interface ItemCardProps {
  id: string
  title: string
  assetCount: number
  thumbnailPath?: string
  primaryAssetType?: AssetType
  metadataPreview?: string
  onclick?: () => void
  onDelete?: (e: MouseEvent) => void
  deleteAriaLabel?: string
}
