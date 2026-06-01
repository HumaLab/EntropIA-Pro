export { default as NoteEditor } from './NoteEditor.svelte'
export type { NoteEditorProps } from './NoteEditor.types'
export {
  convertLegacyNoteTextToHtml,
  hasNoteEditorMeaningfulChanges,
  isLegacyPlainTextNoteContent,
  isNoteHtmlEffectivelyEmpty,
  normalizeNoteLinkHref,
  normalizeNoteContentForEditor,
  normalizeNoteContentForRender,
  sanitizeNoteHtml,
  shouldDisableNoteEditorSave,
} from './note-content'
