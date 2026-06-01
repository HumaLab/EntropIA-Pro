export interface NoteEditorProps {
  content?: string
  placeholder?: string
  onsave?: (content: string) => void | Promise<void>
  oncancel?: () => void
  ondictate?: (audio: Blob) => Promise<string>
  dictationMaxSeconds?: number
  clearOnSave?: boolean
  saveLabel?: string
  cancelLabel?: string
  labels?: Partial<NoteEditorLabels>
}

export interface NoteEditorLabels {
  toolbarAriaLabel: string
  textStyleGroup: string
  structureGroup: string
  insertGroup: string
  dictationGroup: string
  bold: string
  italic: string
  underline: string
  inlineCode: string
  heading1: string
  heading2: string
  heading3: string
  bulletList: string
  bulletListShort: string
  orderedList: string
  orderedListShort: string
  quote: string
  quoteShort: string
  addLink: string
  addLinkShort: string
  removeLink: string
  removeLinkShort: string
  dictationStart: string
  dictationStop: string
  dictationProcessing: string
  dictationIdle: string
  helperText: string
  dictationNoMicrophone: string
  dictationNoAudio: string
  dictationAutoStopProcessing: string
  dictationTranscribing: string
  dictationAutoStopInserted: string
  dictationInserted: string
  dictationNoText: string
  dictationTranscriptionFailed: string
  linkInvalidUrl: string
  linkInvalidHttp: string
  linkInvalidExample: string
  linkModalTitle: string
  linkModalDescription: string
  linkUrlLabel: string
  linkPlaceholder: string
  linkCancel: string
  linkSubmit: string
}
