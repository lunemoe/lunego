import { createEffect, createSignal, on } from 'solid-js'
import html from 'solid-js/html'
import { readValue, type UiChild, type UiNode, type UiValue } from './ui-types.js'

export interface ChoiceItem {
  readonly id: string
  /** Localized choice text supplied by the caller. */
  readonly label: string
  readonly description?: string
  readonly disabled?: boolean
}

export interface ChoiceListProps {
  readonly choices: UiValue<readonly ChoiceItem[]>
  /** Fires at most once per choice set. */
  readonly onChoose: (id: string) => void
  readonly active?: UiValue<string | null>
  readonly label?: string
  readonly emptyLabel?: string
}

/**
 * Keyboard-driven option list. Availability comes from `disabled`; the first
 * committed choice locks the list until the caller supplies a different set.
 */
export function ChoiceList(props: ChoiceListProps): UiNode {
  const [chosen, setChosen] = createSignal<string | null>(null)
  const [focusIndex, setFocusIndex] = createSignal(0)
  const elements = new Map<number, HTMLElement>()
  createEffect(on(() => readValue(props.choices), () => setChosen(null), { defer: true }))

  const choices = () => readValue(props.choices)
  const currentIndex = () => {
    const active = props.active === undefined ? null : readValue(props.active)
    if (active !== null) {
      const index = choices().findIndex((choice) => choice.id === active)
      if (index >= 0) {
        return index
      }
    }
    return focusIndex()
  }
  const focusChoice = (index: number): void => {
    const total = choices().length
    if (total === 0) {
      return
    }
    const next = Math.max(0, Math.min(index, total - 1))
    setFocusIndex(next)
    elements.get(next)?.focus()
  }
  const choose = (choice: ChoiceItem): void => {
    if (choice.disabled === true || chosen() !== null) {
      return
    }
    setChosen(choice.id)
    props.onChoose(choice.id)
  }
  const onKeyDown = (index: number, event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusChoice(index + 1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      focusChoice(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusChoice(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusChoice(choices().length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      const choice = choices()[index]
      if (choice !== undefined) {
        event.preventDefault()
        choose(choice)
      }
    }
  }

  return html`<div class="lg-choices" role="listbox" aria-label=${() => props.label ?? ''}>
    ${() => {
      const list = choices()
      if (list.length === 0) {
        return html`<div class="lg-choices__empty">${props.emptyLabel ?? ''}</div>`
      }
      return list.map((choice, index) => {
        const disabled = () => choice.disabled === true || chosen() !== null
        const classes = () => {
          const names = ['lg-choices__item']
          if (currentIndex() === index) {
            names.push('lg-choices__item--active')
          }
          if (chosen() === choice.id) {
            names.push('lg-choices__item--chosen')
          }
          if (disabled()) {
            names.push('lg-choices__item--disabled')
          }
          return names.join(' ')
        }
        return html`<div class=${classes}
          role="option"
          aria-selected=${() => String(currentIndex() === index)}
          aria-disabled=${() => String(disabled())}
          tabIndex=${() => (currentIndex() === index ? 0 : -1)}
          ref=${(element: HTMLElement) => {
            elements.set(index, element)
          }}
          onClick=${() => choose(choice)}
          onKeyDown=${(event: KeyboardEvent) => onKeyDown(index, event)}>
          <span class="lg-choices__label">${choice.label}</span>
          ${choice.description === undefined
            ? null
            : html`<span class="lg-choices__description">${choice.description}</span>`}
        </div>`
      })
    }}
  </div>`
}

export interface DialogProps {
  /** Localized speaker name supplied by the caller. */
  readonly speaker?: UiValue<string | undefined>
  readonly text: UiValue<string>
  readonly portrait?: UiValue<string | null | undefined>
  readonly choices?: UiValue<readonly ChoiceItem[]>
  readonly onChoose?: (id: string) => void
  readonly onAdvance?: () => void
  /** Required with `onAdvance`; never defaulted by the framework. */
  readonly advanceLabel?: string
  readonly label?: string
  readonly children?: UiChild | (() => UiChild)
}

/** Dialogue panel: speaker, text, portrait and caller-provided choices. */
export function Dialog(props: DialogProps): UiNode {
  return html`<section class="lg-dialog" role="dialog"
    aria-label=${() => props.label ?? readValue(props.speaker ?? '') ?? ''}>
    <div class="lg-dialog__head">
      ${() => {
        const portrait = props.portrait === undefined ? null : readValue(props.portrait)
        return portrait === null || portrait === undefined
          ? null
          : html`<img class="lg-dialog__portrait" src=${portrait}
              alt=${readValue(props.speaker ?? '') ?? ''} draggable="false" />`
      }}
      ${() => {
        const speaker = readValue(props.speaker ?? '')
        return speaker === undefined || speaker.length === 0
          ? null
          : html`<span class="lg-dialog__speaker">${speaker}</span>`
      }}
    </div>
    <p class="lg-dialog__text" aria-live="polite">${() => readValue(props.text)}</p>
    ${props.children ?? null}
    ${() => {
      const choices = props.choices === undefined ? [] : readValue(props.choices)
      if (choices.length > 0) {
        return ChoiceList({
          choices: props.choices ?? [],
          onChoose: (id) => props.onChoose?.(id),
          label: props.label ?? '',
        })
      }
      if (props.onAdvance === undefined || props.advanceLabel === undefined) {
        return null
      }
      return html`<button type="button" class="lg-button lg-dialog__advance"
        onClick=${() => props.onAdvance?.()}>${props.advanceLabel}</button>`
    }}
  </section>`
}

export interface PagedTextProps {
  readonly pages: UiValue<readonly string[]>
  readonly page?: UiValue<number>
  readonly onPageChange?: (index: number) => void
  readonly prevLabel?: string
  readonly nextLabel?: string
  readonly label?: string
  readonly emptyLabel?: string
}

/** Paginated text reader with caller-provided navigation labels. */
export function PagedText(props: PagedTextProps): UiNode {
  const [internalPage, setInternalPage] = createSignal(0)
  const pageCount = () => readValue(props.pages).length
  const index = () => {
    const count = pageCount()
    if (count === 0) {
      return 0
    }
    const requested = props.page === undefined ? internalPage() : readValue(props.page)
    return Math.max(0, Math.min(Math.floor(requested), count - 1))
  }
  const go = (next: number): void => {
    const count = pageCount()
    if (count === 0) {
      return
    }
    const target = Math.max(0, Math.min(next, count - 1))
    if (target === index()) {
      return
    }
    if (props.page === undefined) {
      setInternalPage(target)
    }
    props.onPageChange?.(target)
  }
  return html`<div class="lg-paged" role="group" aria-label=${() => props.label ?? ''}
    tabIndex="0"
    onKeyDown=${(event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(index() - 1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(index() + 1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        go(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        go(pageCount() - 1)
      }
    }}>
    <p class="lg-paged__text" aria-live="polite">${() =>
      readValue(props.pages)[index()] ?? props.emptyLabel ?? ''}</p>
    <div class="lg-paged__nav">
      <button type="button" class="lg-button lg-paged__prev"
        aria-label=${() => props.prevLabel ?? ''}
        disabled=${() => index() <= 0}
        onClick=${() => go(index() - 1)}>${() => props.prevLabel ?? ''}</button>
      <span class="lg-paged__count">${() => `${index() + 1}/${pageCount()}`}</span>
      <button type="button" class="lg-button lg-paged__next"
        aria-label=${() => props.nextLabel ?? ''}
        disabled=${() => pageCount() === 0 || index() >= pageCount() - 1}
        onClick=${() => go(index() + 1)}>${() => props.nextLabel ?? ''}</button>
    </div>
  </div>`
}
