export interface MetadataEditorProps {
  value?: Record<string, string>
  onchange?: (metadata: Record<string, string>) => void
  labels?: Partial<MetadataEditorLabels>
}

export interface MetadataEditorLabels {
  keyPlaceholder: string
  valuePlaceholder: string
  removeFieldAria: string
  addField: string
  fieldLabel: string
  valueLabel: string
  emptyText: string
}
