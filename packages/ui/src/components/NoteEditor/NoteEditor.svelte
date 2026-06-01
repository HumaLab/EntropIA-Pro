<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { Editor } from '@tiptap/core'
  import StarterKit from '@tiptap/starter-kit'
  import Underline from '@tiptap/extension-underline'
  import Link from '@tiptap/extension-link'
  import Placeholder from '@tiptap/extension-placeholder'

  import type { NoteEditorLabels, NoteEditorProps } from './NoteEditor.types'
  import {
    hasNoteEditorMeaningfulChanges,
    isNoteHtmlEffectivelyEmpty,
    normalizeNoteContentForEditor,
    normalizeNoteContentForRender,
    sanitizeNoteHtml,
    shouldDisableNoteEditorSave,
  } from './note-content'

  let {
    content = '',
    placeholder = '',
    onsave,
    oncancel,
    ondictate,
    dictationMaxSeconds = 300,
    clearOnSave = true,
    saveLabel = 'Save',
    cancelLabel = 'Cancel',
    labels: labelsProp = {},
  }: NoteEditorProps = $props()

  const defaultLabels: NoteEditorLabels = {
    toolbarAriaLabel: 'Formatting toolbar',
    textStyleGroup: 'Text style',
    structureGroup: 'Structure',
    insertGroup: 'Insert',
    dictationGroup: 'Dictation',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    inlineCode: 'Inline code',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bulletList: 'Bullet list',
    bulletListShort: 'List',
    orderedList: 'Ordered list',
    orderedListShort: '1. List',
    quote: 'Quote',
    quoteShort: 'Quote',
    addLink: 'Add link',
    addLinkShort: 'Link',
    removeLink: 'Remove link',
    removeLinkShort: 'Unlink',
    dictationStart: 'Start dictation',
    dictationStop: 'Stop dictation',
    dictationProcessing: 'Processing dictation...',
    dictationIdle: 'Dictation',
    helperText: 'Tip: select text to apply formatting or links.',
    dictationNoMicrophone: 'Microphone is not available on this device.',
    dictationNoAudio: 'Could not capture audio from the microphone.',
    dictationAutoStopProcessing: 'Reached the maximum of {duration}. Processing audio...',
    dictationTranscribing: 'Transcribing audio...',
    dictationAutoStopInserted: 'Reached the maximum of {duration}. Text inserted.',
    dictationInserted: 'Text inserted from the microphone.',
    dictationNoText: 'No text was detected in the audio.',
    dictationTranscriptionFailed: 'Could not transcribe the audio.',
    linkInvalidUrl: 'Enter a valid URL.',
    linkInvalidHttp: 'Use a valid http or https URL.',
    linkInvalidExample: 'Enter a valid URL, for example https://entropia.app.',
    linkModalTitle: 'Insert link',
    linkModalDescription: 'Paste a valid URL for the selected text.',
    linkUrlLabel: 'URL',
    linkPlaceholder: 'https://...',
    linkCancel: 'Cancel',
    linkSubmit: 'Insert',
  }

  const labels = $derived({ ...defaultLabels, ...labelsProp })

  let editorElement: HTMLDivElement | undefined = $state(undefined)
  let linkInputElement: HTMLInputElement | undefined = $state(undefined)
  let editor = $state<Editor | null>(null)
  let editorRevision = $state(0)
  let currentHtml = $state('<p></p>')
  let originalHtml = $state('<p></p>')
  let lastExternalHtml = $state('')
  let isFocused = $state(false)
  let dictationState = $state<'idle' | 'recording' | 'transcribing' | 'error'>('idle')
  let dictationSeconds = $state(0)
  let dictationMessage = $state<string | null>(null)
  let dictationAutoStopped = $state(false)
  let mediaRecorder = $state<MediaRecorder | null>(null)
  let mediaStream = $state<MediaStream | null>(null)
  let dictationTimer = $state<ReturnType<typeof setInterval> | null>(null)
  let dictationChunks = $state<Blob[]>([])
  let dictationProcessing = $state<Promise<void> | null>(null)
  let dictationSelection = $state<{ from: number; to: number } | null>(null)
  let isLinkModalOpen = $state(false)
  let linkDraftHref = $state('')
  let linkModalError = $state<string | null>(null)
  let linkSelection = $state<{ from: number; to: number } | null>(null)

  const showCancel = $derived(typeof oncancel === 'function')
  const supportsDictation = $derived(typeof ondictate === 'function')
  const isEmpty = $derived(isNoteHtmlEffectivelyEmpty(currentHtml))
  const isEditing = $derived(showCancel || !clearOnSave)
  const hasChanges = $derived(
    hasNoteEditorMeaningfulChanges({
      originalContent: originalHtml,
      currentContent: currentHtml,
    })
  )
  const isSaveDisabled = $derived(
    shouldDisableNoteEditorSave({
      currentContent: currentHtml,
      originalContent: originalHtml,
      isEditing,
    })
  )

  const dictationButtonLabel = $derived.by(() => {
    if (dictationState === 'recording') return labels.dictationStop
    if (dictationState === 'transcribing') return labels.dictationProcessing
    return labels.dictationStart
  })

  const dictationTimerLabel = $derived(formatDuration(dictationSeconds))

  const linkModalTitleId = 'note-editor-link-modal-title'
  const linkModalDescriptionId = 'note-editor-link-modal-description'
  const linkModalErrorId = 'note-editor-link-modal-error'

  type ToolbarButton = {
    label: string
    shortLabel: string
    isActive: () => boolean
    action: () => void
  }

  type ToolbarGroup = {
    label: string
    buttons: ToolbarButton[]
  }

  const toolbarGroups = $derived.by<ToolbarGroup[]>(() => [
    {
      label: labels.textStyleGroup,
      buttons: [
        {
          label: labels.bold,
          shortLabel: 'B',
          isActive: () => editor?.isActive('bold') ?? false,
          action: () => editor?.chain().focus().toggleBold().run(),
        },
        {
          label: labels.italic,
          shortLabel: 'I',
          isActive: () => editor?.isActive('italic') ?? false,
          action: () => editor?.chain().focus().toggleItalic().run(),
        },
        {
          label: labels.underline,
          shortLabel: 'U',
          isActive: () => editor?.isActive('underline') ?? false,
          action: () => editor?.chain().focus().toggleUnderline().run(),
        },
        {
          label: labels.inlineCode,
          shortLabel: '</>',
          isActive: () => editor?.isActive('code') ?? false,
          action: () => editor?.chain().focus().toggleCode().run(),
        },
      ],
    },
    {
      label: labels.structureGroup,
      buttons: [
        {
          label: labels.heading1,
          shortLabel: 'H1',
          isActive: () => editor?.isActive('heading', { level: 1 }) ?? false,
          action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
        },
        {
          label: labels.heading2,
          shortLabel: 'H2',
          isActive: () => editor?.isActive('heading', { level: 2 }) ?? false,
          action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          label: labels.heading3,
          shortLabel: 'H3',
          isActive: () => editor?.isActive('heading', { level: 3 }) ?? false,
          action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
        },
        {
          label: labels.bulletList,
          shortLabel: labels.bulletListShort,
          isActive: () => editor?.isActive('bulletList') ?? false,
          action: () => editor?.chain().focus().toggleBulletList().run(),
        },
        {
          label: labels.orderedList,
          shortLabel: labels.orderedListShort,
          isActive: () => editor?.isActive('orderedList') ?? false,
          action: () => editor?.chain().focus().toggleOrderedList().run(),
        },
        {
          label: labels.quote,
          shortLabel: labels.quoteShort,
          isActive: () => editor?.isActive('blockquote') ?? false,
          action: () => editor?.chain().focus().toggleBlockquote().run(),
        },
      ],
    },
    {
      label: labels.insertGroup,
      buttons: [
        {
          label: labels.addLink,
          shortLabel: labels.addLinkShort,
          isActive: () => editor?.isActive('link') ?? false,
          action: () => updateLink(),
        },
        {
          label: labels.removeLink,
          shortLabel: labels.removeLinkShort,
          isActive: () => false,
          action: () => removeLink(),
        },
      ],
    },
  ])

  function withDuration(template: string, duration: string) {
    return template.replace('{duration}', duration)
  }

  function bumpEditorRevision() {
    editorRevision += 1
  }

  function syncEditorState(nextHtml: string) {
    currentHtml = nextHtml || '<p></p>'
    bumpEditorRevision()
  }

  function buildEditor() {
    if (!editorElement) return

    const instance = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          autolink: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          },
        }),
        Placeholder.configure({ placeholder }),
      ],
      content: currentHtml,
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'note-editor__content ProseMirror',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-placeholder': placeholder,
          'data-testid': 'note-editor-input',
        },
      },
      onCreate: ({ editor }: { editor: Editor }) => {
        dictationSelection = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        }
        syncEditorState(sanitizeNoteHtml(editor.getHTML()) || '<p></p>')
      },
      onUpdate: ({ editor }: { editor: Editor }) => {
        syncEditorState(sanitizeNoteHtml(editor.getHTML()) || '<p></p>')
      },
      onSelectionUpdate: ({ editor }: { editor: Editor }) => {
        dictationSelection = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        }
        bumpEditorRevision()
      },
      onFocus: () => {
        isFocused = true
        bumpEditorRevision()
      },
      onBlur: () => {
        isFocused = false
        bumpEditorRevision()
      },
    })

    editor = instance
  }

  function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  function resetDictationTimer() {
    if (dictationTimer) {
      clearInterval(dictationTimer)
      dictationTimer = null
    }
    dictationSeconds = 0
  }

  function stopMediaStreamTracks() {
    mediaStream?.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }

  function setDictationMessage(message: string | null, tone: 'idle' | 'error' = 'idle') {
    dictationMessage = message
    if (tone === 'error') {
      dictationState = 'error'
    }
  }

  function getDictationInsertionPlan(text: string) {
    if (!editor) {
      return { text: text.trim(), leadingSpace: false, trailingSpace: false }
    }

    const trimmed = text.trim()
    if (!trimmed) return { text: '', leadingSpace: false, trailingSpace: false }

    if (!dictationSelection) {
      const currentText = editor.getText()
      const prevChar = currentText.slice(-1)
      return {
        text: trimmed,
        leadingSpace: Boolean(prevChar) && !/\s/.test(prevChar) && !/^[\s,.;:!?)]/.test(trimmed),
        trailingSpace: false,
      }
    }

    const fallbackSelection = {
      from: editor.state.doc.content.size,
      to: editor.state.doc.content.size,
    }
    const { from, to } = dictationSelection ?? fallbackSelection
    const prevChar = editor.state.doc.textBetween(Math.max(0, from - 1), from, '', '')
    const nextChar = editor.state.doc.textBetween(
      to,
      Math.min(editor.state.doc.content.size, to + 1),
      '',
      ''
    )

    const needsLeadingSpace =
      from > 1 && prevChar && !/\s/.test(prevChar) && !/^[\s,.;:!?)]/.test(trimmed)
    const needsTrailingSpace = nextChar && !/\s/.test(nextChar) && !/[\s([{]$/.test(trimmed)

    return {
      text: trimmed,
      leadingSpace: Boolean(needsLeadingSpace),
      trailingSpace: Boolean(needsTrailingSpace),
    }
  }

  function insertDictationText(text: string) {
    if (!editor) return

    const insertion = getDictationInsertionPlan(text)
    if (!insertion.text) return

    const insertionText = `${insertion.leadingSpace ? ' ' : ''}${insertion.text}${insertion.trailingSpace ? ' ' : ''}`

    if (dictationSelection) {
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: dictationSelection.from, to: dictationSelection.to },
          insertionText
        )
        .run()
    } else {
      editor.chain().focus('end').insertContent(insertionText).run()
    }
    syncEditorState(sanitizeNoteHtml(editor.getHTML()) || '<p></p>')
  }

  async function finalizeDictation() {
    const recorder = mediaRecorder
    const wasAutoStopped = dictationAutoStopped
    const audioBlob = new Blob(dictationChunks, {
      type: recorder?.mimeType || 'audio/webm',
    })

    dictationChunks = []
    mediaRecorder = null
    stopMediaStreamTracks()
    resetDictationTimer()

    if (!ondictate || audioBlob.size === 0) {
      dictationState = 'idle'
      if (audioBlob.size === 0) {
        const isLinux = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('linux')
        const hint = isLinux
          ? ' En Linux, esto suele deberse a una incompatibilidad entre WebKitGTK y GStreamer (se requiere GStreamer ≥ 1.22).'
          : ''
        setDictationMessage(labels.dictationNoAudio + hint, 'error')
      }
      return
    }

    dictationState = 'transcribing'
    if (wasAutoStopped) {
      dictationMessage = withDuration(
        labels.dictationAutoStopProcessing,
        formatDuration(dictationMaxSeconds)
      )
    } else {
      dictationMessage = labels.dictationTranscribing
    }

    try {
      const text = (await ondictate(audioBlob)).trim()
      if (text) {
        insertDictationText(text)
        dictationMessage = wasAutoStopped
          ? withDuration(labels.dictationAutoStopInserted, formatDuration(dictationMaxSeconds))
          : labels.dictationInserted
        dictationState = 'idle'
      } else {
        setDictationMessage(labels.dictationNoText, 'error')
      }
    } catch (error) {
      setDictationMessage(
        error instanceof Error ? error.message : labels.dictationTranscriptionFailed,
        'error'
      )
    } finally {
      dictationAutoStopped = false
      dictationProcessing = null
    }
  }

  async function stopDictation(options?: { autoStop?: boolean }) {
    const recorder = mediaRecorder
    if (!recorder || recorder.state !== 'recording') return

    dictationAutoStopped = options?.autoStop ?? false
    recorder.requestData()
    const processing = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        void finalizeDictation().finally(resolve)
      }
    })
    dictationProcessing = processing
    recorder.stop()
    await processing
  }

  async function startDictation() {
    if (!ondictate) return

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setDictationMessage(labels.dictationNoMicrophone, 'error')
      return
    }

    try {
      dictationChunks = []
      dictationMessage = null
      dictationAutoStopped = false
      dictationSelection = editor?.isFocused
        ? {
            from: editor.state.selection.from,
            to: editor.state.selection.to,
          }
        : null
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStream = stream

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ]
      const mimeType =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? preferredTypes.find((t) => MediaRecorder.isTypeSupported(t))
          : undefined

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          dictationChunks = [...dictationChunks, event.data]
        }
      }
      mediaRecorder = recorder
      dictationState = 'recording'
      dictationSeconds = 0
      recorder.start(1000)

      dictationTimer = setInterval(() => {
        dictationSeconds += 1
        if (dictationSeconds >= dictationMaxSeconds) {
          void stopDictation({ autoStop: true })
        }
      }, 1000)
    } catch (error) {
      stopMediaStreamTracks()
      resetDictationTimer()
      setDictationMessage(
        error instanceof Error ? error.message : labels.dictationNoMicrophone,
        'error'
      )
    }
  }

  async function toggleDictation() {
    if (dictationState === 'transcribing') return
    if (dictationState === 'recording') {
      await stopDictation()
      return
    }
    await startDictation()
  }

  function normalizeLinkHref(value: string) {
    const trimmed = value.trim()

    if (!trimmed) {
      return {
        isValid: false,
        normalized: '',
        error: labels.linkInvalidUrl,
      }
    }

    const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`

    try {
      const url = new URL(candidate)

      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          isValid: false,
          normalized: '',
          error: labels.linkInvalidHttp,
        }
      }

      return {
        isValid: true,
        normalized: url.toString(),
        error: null,
      }
    } catch {
      return {
        isValid: false,
        normalized: '',
        error: labels.linkInvalidExample,
      }
    }
  }

  async function updateLink() {
    if (!editor) return

    const { from, to } = editor.state.selection

    linkSelection = { from, to }
    linkDraftHref = editor.getAttributes('link').href ?? ''
    linkModalError = null
    isLinkModalOpen = true

    await tick()

    linkInputElement?.focus()
    linkInputElement?.select()
  }

  function closeLinkModal() {
    isLinkModalOpen = false
    linkModalError = null
    linkDraftHref = ''
    linkSelection = null

    editor?.commands.focus()
  }

  function handleLinkInput() {
    if (linkModalError) {
      linkModalError = null
    }
  }

  function submitLink() {
    if (!editor) return

    const result = normalizeLinkHref(linkDraftHref)

    if (!result.isValid) {
      linkModalError = result.error
      linkInputElement?.focus()
      return
    }

    let chain = editor.chain().focus()

    if (linkSelection) {
      chain = chain.setTextSelection(linkSelection)
    }

    chain.extendMarkRange('link').setLink({ href: result.normalized }).run()

    closeLinkModal()
    bumpEditorRevision()
  }

  function handleLinkModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeLinkModal()
    }
  }

  function removeLink() {
    if (!editor) return

    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    bumpEditorRevision()
  }

  function clearEditor() {
    editor?.commands.setContent('<p></p>', false)
    currentHtml = '<p></p>'
    originalHtml = '<p></p>'
    lastExternalHtml = normalizeNoteContentForEditor(content)
    bumpEditorRevision()
  }

  async function handleSave() {
    if (!editor || isSaveDisabled) return

    const html = normalizeNoteContentForRender(editor.getHTML())
    if (!html) return

    try {
      await onsave?.(html)

      if (clearOnSave) {
        clearEditor()
        editor.commands.focus('end')
        return
      }

      originalHtml = html
      lastExternalHtml = html
      currentHtml = html || '<p></p>'
      editor.commands.setContent(html, false)
      editor.commands.focus('end')
      bumpEditorRevision()
    } catch {
      // Save failed — keep content so the user can retry
    }
  }

  onMount(() => {
    const normalizedInitial = normalizeNoteContentForEditor(content)
    currentHtml = normalizedInitial
    originalHtml = normalizedInitial
    lastExternalHtml = normalizedInitial
    buildEditor()
  })

  onDestroy(() => {
    resetDictationTimer()
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop()
    }
    stopMediaStreamTracks()
    editor?.destroy()
    editor = null
  })

  $effect(() => {
    const normalizedExternal = normalizeNoteContentForEditor(content)

    if (normalizedExternal === lastExternalHtml) {
      return
    }

    lastExternalHtml = normalizedExternal
    originalHtml = normalizedExternal
    currentHtml = normalizedExternal

    if (!editor) {
      return
    }

    const currentEditorHtml = normalizeNoteContentForRender(editor.getHTML())
    const nextEditorHtml = normalizeNoteContentForRender(normalizedExternal)

    if (currentEditorHtml !== nextEditorHtml) {
      editor.commands.setContent(normalizedExternal, false)
      bumpEditorRevision()
    }
  })
</script>

<div class="note-editor">
  <div
    class="note-editor__toolbar"
    aria-label={labels.toolbarAriaLabel}
    data-editor-revision={editorRevision}
  >
    {#each toolbarGroups as group (group.label)}
      <div class="note-editor__tool-group" role="group" aria-label={group.label}>
        {#each group.buttons as button (button.label)}
          <button
            type="button"
            class="note-editor__tool"
            class:note-editor__tool--active={button.isActive()}
            aria-pressed={button.isActive()}
            aria-label={button.label}
            title={button.label}
            onmousedown={(event) => event.preventDefault()}
            onclick={button.action}
          >
            {button.shortLabel}
          </button>
        {/each}
      </div>
    {/each}

    {#if supportsDictation}
      <div class="note-editor__tool-group" role="group" aria-label={labels.dictationGroup}>
        <button
          type="button"
          class="note-editor__tool note-editor__tool--dictation"
          class:note-editor__tool--active={dictationState === 'recording'}
          aria-label={dictationButtonLabel}
          title={dictationButtonLabel}
          disabled={dictationState === 'transcribing'}
          onmousedown={(event) => event.preventDefault()}
          onclick={toggleDictation}
        >
          🎙
        </button>
        <span class="note-editor__dictation-status" data-testid="note-editor-dictation-timer">
          {#if dictationState === 'recording'}
            {dictationTimerLabel} / {formatDuration(dictationMaxSeconds)}
          {:else if dictationState === 'transcribing'}
            Procesando...
          {:else}
            {labels.dictationIdle}
          {/if}
        </span>
      </div>
    {/if}
  </div>

  <p class="note-editor__helper">{labels.helperText}</p>

  {#if dictationMessage}
    <p
      class="note-editor__dictation-message"
      class:note-editor__dictation-message--error={dictationState === 'error'}
      data-testid="note-editor-dictation-message"
    >
      {dictationMessage}
    </p>
  {/if}

  <div class="note-editor__surface" class:note-editor__surface--focused={isFocused}>
    <div bind:this={editorElement}></div>
  </div>

  <div class="note-editor__actions">
    {#if showCancel}
      <button
        class="note-editor__btn note-editor__btn--ghost"
        type="button"
        data-testid="note-cancel"
        onclick={() => oncancel?.()}
      >
        {cancelLabel}
      </button>
    {/if}

    <button
      class="note-editor__btn note-editor__btn--save"
      type="button"
      data-testid="note-save"
      disabled={isSaveDisabled}
      aria-disabled={isSaveDisabled}
      onclick={handleSave}
    >
      {saveLabel}
    </button>
  </div>

  {#if isLinkModalOpen}
    <div
      class="note-editor__modal-backdrop"
      role="presentation"
      onclick={(event) => {
        if (event.currentTarget === event.target) {
          closeLinkModal()
        }
      }}
    >
      <div
        class="note-editor__modal"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby={linkModalTitleId}
        aria-describedby={linkModalError ? linkModalErrorId : linkModalDescriptionId}
        onkeydown={handleLinkModalKeydown}
      >
        <div class="note-editor__modal-header">
          <div class="note-editor__modal-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path
                d="M8.75 14.75 6.5 17a3.182 3.182 0 0 1-4.5-4.5l3-3a3.182 3.182 0 0 1 4.5 0 .75.75 0 1 0 1.06-1.06 4.682 4.682 0 0 0-6.62 0l-3 3a4.682 4.682 0 0 0 6.62 6.62l2.25-2.25a.75.75 0 1 0-1.06-1.06Zm8.31-12.81a4.682 4.682 0 0 0-6.62 0L8.19 4.19a.75.75 0 1 0 1.06 1.06l2.25-2.25a3.182 3.182 0 1 1 4.5 4.5l-3 3a3.182 3.182 0 0 1-4.5 0 .75.75 0 0 0-1.06 1.06 4.682 4.682 0 0 0 6.62 0l3-3a4.682 4.682 0 0 0 0-6.62Zm-9.62 9.62a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-3 3a.75.75 0 0 0 0 1.06Z"
              />
            </svg>
          </div>
          <div class="note-editor__modal-copy">
            <h3 id={linkModalTitleId}>{labels.linkModalTitle}</h3>
            <p id={linkModalDescriptionId}>{labels.linkModalDescription}</p>
          </div>
        </div>

        <form
          class="note-editor__modal-form"
          novalidate
          onsubmit={(event) => {
            event.preventDefault()
            submitLink()
          }}
        >
          <label class="note-editor__modal-label" for="note-editor-link-input"
            >{labels.linkUrlLabel}</label
          >
          <input
            id="note-editor-link-input"
            bind:this={linkInputElement}
            class="note-editor__modal-input"
            type="text"
            inputmode="url"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            placeholder={labels.linkPlaceholder}
            bind:value={linkDraftHref}
            aria-invalid={linkModalError ? 'true' : 'false'}
            aria-describedby={linkModalError ? linkModalErrorId : linkModalDescriptionId}
            data-testid="note-editor-link-input"
            oninput={handleLinkInput}
          />

          {#if linkModalError}
            <p
              id={linkModalErrorId}
              class="note-editor__modal-error"
              data-testid="note-editor-link-error"
            >
              {linkModalError}
            </p>
          {/if}

          <div class="note-editor__modal-actions">
            <button
              type="button"
              class="note-editor__btn note-editor__btn--ghost"
              data-testid="note-editor-link-cancel"
              onclick={closeLinkModal}
            >
              {labels.linkCancel}
            </button>
            <button
              type="submit"
              class="note-editor__btn note-editor__btn--save"
              data-testid="note-editor-link-submit"
            >
              {labels.linkSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .note-editor__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
  }

  .note-editor__tool-group {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0;
    padding: 0.125rem;
    border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-surface) 90%, black 10%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .note-editor__tool,
  .note-editor__btn {
    padding: 0.45rem 0.65rem;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-md);
    cursor: pointer;
    border: 1px solid var(--color-border);
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .note-editor__tool--dictation {
    min-width: 2.75rem;
  }

  .note-editor__tool {
    min-width: 2.5rem;
    background: color-mix(in srgb, var(--color-surface-raised) 45%, transparent);
    color: var(--color-text-primary);
    border-color: transparent;
  }

  .note-editor__tool:hover,
  .note-editor__btn:hover:not(:disabled) {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
    background: color-mix(in srgb, var(--color-surface) 72%, black 28%);
  }

  .note-editor__tool--active {
    border-color: color-mix(in srgb, var(--color-accent) 60%, var(--color-border));
    background: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface));
    color: var(--color-text-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 24%, transparent);
  }

  .note-editor__helper {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .note-editor__dictation-status {
    display: inline-flex;
    align-items: center;
    padding: 0 0.5rem;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .note-editor__dictation-message {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .note-editor__dictation-message--error {
    color: #ff8f8f;
  }

  .note-editor__surface {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    overflow: hidden;
    transition:
      border-color var(--transition-base),
      box-shadow var(--transition-base);
  }

  .note-editor__surface--focused {
    border-color: color-mix(in srgb, var(--color-accent) 65%, var(--color-border));
    box-shadow: 0 0 0 2px rgba(124, 149, 255, 0.12);
  }

  .note-editor__surface :global(.ProseMirror) {
    min-height: 88px;
    padding: var(--space-3);
    color: var(--color-text-primary);
    outline: none;
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .note-editor__surface :global(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: var(--color-text-muted);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .note-editor__surface :global(.ProseMirror p:first-child) {
    margin-top: 0;
  }

  .note-editor__surface :global(.ProseMirror p:last-child) {
    margin-bottom: 0;
  }

  .note-editor__surface :global(.ProseMirror a) {
    color: var(--color-accent-hover);
    text-decoration: underline;
  }

  .note-editor__surface :global(.ProseMirror blockquote) {
    margin: var(--space-3) 0;
    padding-left: var(--space-3);
    border-left: 3px solid color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
    color: var(--color-text-secondary);
  }

  .note-editor__surface :global(.ProseMirror code) {
    background: color-mix(in srgb, var(--color-border) 65%, transparent);
    border-radius: var(--radius-sm);
    padding: 0.1rem 0.3rem;
    font-size: 0.95em;
  }

  .note-editor__surface :global(.ProseMirror pre) {
    background: color-mix(in srgb, var(--color-surface) 76%, black 24%);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    overflow-x: auto;
  }

  .note-editor__surface :global(.ProseMirror ul),
  .note-editor__surface :global(.ProseMirror ol) {
    padding-left: 1.25rem;
  }

  .note-editor__surface :global(.ProseMirror:focus) {
    box-shadow: none;
  }

  .note-editor__surface :global(.ProseMirror ::selection) {
    background: color-mix(in srgb, var(--color-accent) 35%, transparent);
  }

  .note-editor__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .note-editor__modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: rgba(7, 10, 18, 0.76);
    backdrop-filter: blur(10px);
  }

  .note-editor__modal {
    width: min(100%, 28rem);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
    border-radius: var(--radius-xl);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.035), transparent 32%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 100%),
      color-mix(in srgb, var(--color-surface) 92%, black 8%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 24px 60px rgba(0, 0, 0, 0.38);
  }

  .note-editor__modal-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .note-editor__modal-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-lg);
    border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
    background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
    color: var(--color-accent-hover);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .note-editor__modal-icon svg {
    width: 1rem;
    height: 1rem;
    fill: currentColor;
  }

  .note-editor__modal-copy {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .note-editor__modal-copy h3 {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  .note-editor__modal-copy p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .note-editor__modal-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .note-editor__modal-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: 0.02em;
    color: var(--color-text-secondary);
  }

  .note-editor__modal-input {
    width: 100%;
    padding: 0.8rem 0.95rem;
    border: 1px solid color-mix(in srgb, var(--color-border) 90%, transparent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-surface) 82%, black 18%);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background-color 0.15s ease;
  }

  .note-editor__modal-input::placeholder {
    color: var(--color-text-muted);
  }

  .note-editor__modal-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--color-accent) 65%, var(--color-border));
    box-shadow: 0 0 0 3px rgba(124, 149, 255, 0.12);
    background: color-mix(in srgb, var(--color-surface) 88%, black 12%);
  }

  .note-editor__modal-input[aria-invalid='true'] {
    border-color: rgba(255, 143, 143, 0.5);
    box-shadow: 0 0 0 3px rgba(255, 143, 143, 0.08);
  }

  .note-editor__modal-error {
    margin: 0;
    font-size: var(--font-size-xs);
    color: #ff9f9f;
  }

  .note-editor__modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .note-editor__btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .note-editor__btn--ghost {
    background: transparent;
    color: var(--color-text-secondary);
  }

  .note-editor__btn--save {
    background-color: var(--color-accent);
    color: var(--color-bg);
    border-color: var(--color-accent);
  }

  .note-editor__btn--save:disabled {
    opacity: 1;
    background-color: var(--color-surface-elevated);
    color: var(--color-text-secondary);
    border-color: var(--color-border-strong);
  }

  .note-editor__btn--save:hover:not(:disabled) {
    background-color: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }
</style>
