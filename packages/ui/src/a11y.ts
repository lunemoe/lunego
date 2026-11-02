import { createUniqueId } from 'solid-js'
import html from 'solid-js/html'
import { resolveText, type TextValue } from './text.js'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

/** Handler for Enter/Space activation that also works in DOM test environments. */
export function activateOnKey(handler: () => void): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handler()
    }
  }
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

/** True when keyboard events belong to a text/input control rather than a widget. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    target.closest(EDITABLE_SELECTOR) !== null
  )
}

export interface UiDescription {
  readonly id: string
  readonly describedBy: () => string | undefined
  readonly node: () => UiNode | null
}

/** Caller-provided description, rendered visually hidden and wired via aria. */
export function createDescription(description?: UiValue<TextValue | undefined>): UiDescription {
  const id = `lg-desc-${createUniqueId()}`
  const text = (): string => {
    const value = description === undefined ? undefined : readValue(description)
    return value === undefined || value === null ? '' : resolveText(value)
  }
  return {
    id,
    describedBy: () => (text().length === 0 ? undefined : id),
    node: () => {
      const content = text()
      return content.length === 0
        ? null
        : html`<span id=${id} class="lg-sr-only">${content}</span>`
    },
  }
}
