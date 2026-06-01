export const DOCUMENT_EXPLORER_ASSET_SELECTED_EVENT = 'entropia:document-explorer-asset-selected'
export const DOCUMENT_EXPLORER_ASSET_SELECT_REQUEST_EVENT =
  'entropia:document-explorer-asset-select-request'

export interface DocumentExplorerAssetDetail {
  itemId: string
  assetId: string | null
}
