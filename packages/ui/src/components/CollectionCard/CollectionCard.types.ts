export interface CollectionCardProps {
  id: string
  name: string
  description?: string
  itemCount: number
  updatedAt: number // unix ms timestamp
  onclick?: () => void
  onedit?: () => void
  ondelete?: () => void
  editAriaLabel?: string
  deleteAriaLabel?: string
}
