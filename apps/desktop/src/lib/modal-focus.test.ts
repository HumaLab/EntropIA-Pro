import { describe, expect, it } from 'vitest'
import { getFocusableElements, getNextFocusTrapTarget } from './modal-focus'

describe('modal-focus helpers', () => {
  it('collects only enabled and visible focusable elements', () => {
    const container = document.createElement('div')
    const enabledButton = document.createElement('button')
    const disabledButton = document.createElement('button')
    disabledButton.setAttribute('disabled', '')
    const hiddenLink = document.createElement('a')
    hiddenLink.href = '#hidden'
    hiddenLink.setAttribute('hidden', '')
    const input = document.createElement('input')

    container.append(enabledButton, disabledButton, hiddenLink, input)

    expect(getFocusableElements(container)).toEqual([enabledButton, input])
  })

  it('cycles focus forward and backward within the modal set', () => {
    const firstButton = document.createElement('button')
    const secondButton = document.createElement('button')
    const focusableElements = [firstButton, secondButton]

    expect(getNextFocusTrapTarget(focusableElements, firstButton, false)).toBe(secondButton)
    expect(getNextFocusTrapTarget(focusableElements, secondButton, false)).toBe(firstButton)
    expect(getNextFocusTrapTarget(focusableElements, firstButton, true)).toBe(secondButton)
    expect(getNextFocusTrapTarget(focusableElements, secondButton, true)).toBe(firstButton)
  })

  it('falls back to the modal container when no tabbable elements exist', () => {
    const fallback = document.createElement('div')

    expect(getNextFocusTrapTarget([], null, false, fallback)).toBe(fallback)
  })
})
