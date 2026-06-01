import { describe, expect, it } from 'vitest'
import { shouldCopyExpandedCellFromShortcut } from './db-browser-shortcuts'

describe('shouldCopyExpandedCellFromShortcut', () => {
  it('accepts Ctrl+C and Cmd+C for non-editable targets', () => {
    expect(
      shouldCopyExpandedCellFromShortcut({
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: document.createElement('div'),
      })
    ).toBe(true)

    expect(
      shouldCopyExpandedCellFromShortcut({
        key: 'C',
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
        target: document.createElement('button'),
      })
    ).toBe(true)
  })

  it('ignores editable targets and unrelated shortcuts', () => {
    const input = document.createElement('input')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')

    expect(
      shouldCopyExpandedCellFromShortcut({
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: input,
      })
    ).toBe(false)

    expect(
      shouldCopyExpandedCellFromShortcut({
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: editable,
      })
    ).toBe(false)

    expect(
      shouldCopyExpandedCellFromShortcut({
        key: 'x',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: document.createElement('div'),
      })
    ).toBe(false)
  })
})
