import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import {
  Button,
  Dialog,
  Panel,
  ShopRow,
  TreeView,
  UiRoot,
  VirtualList,
  createUiBridge,
  mountUi,
  resolveText,
  setUiTextResolver,
  themeVariables,
  type TextValue,
  type UiGame,
  type UiI18nSource,
  type UiNode,
} from '../index.js'

function gameStub(): UiGame {
  return {
    frame: { tick: 0, events: [], cues: [], modelPatches: [], models: {} },
    send: async () => ({}),
    query: ((_query: unknown, _args: unknown) => 0) as UiGame['query'],
  }
}

function mount(view: () => UiNode): { root: HTMLElement; dispose: () => void } {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const mounted = mountUi(root, createUiBridge(gameStub()), view)
  return { root, dispose: () => mounted.dispose() }
}

interface FakeI18n {
  readonly source: UiI18nSource
  setLocale(locale: 'en' | 'fr'): void
}

function fakeI18n(): FakeI18n {
  const [locale, setLocaleSignal] = createSignal<'en' | 'fr'>('en')
  const listeners = new Set<() => void>()
  const table = {
    en: { greet: 'Hello', buy: 'Buy' },
    fr: { greet: 'Bonjour', buy: 'Acheter' },
  } as const
  return {
    source: {
      t: (key: string) => table[locale()][key as 'greet' | 'buy'] ?? key,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    setLocale: (next: 'en' | 'fr') => {
      setLocaleSignal(next)
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  setUiTextResolver(null)
  document.body.innerHTML = ''
})

describe('ui i18n integration', () => {
  it('resolves message refs and keeps literal string overrides', () => {
    const i18n = fakeI18n()
    const { root, dispose } = mount(() =>
      UiRoot({
        i18n: i18n.source,
        children: [
          Panel({ title: { key: 'greet' }, children: 'body' }),
          Button({ label: { key: 'buy' }, onClick: () => undefined }),
          Button({ children: 'Literal' }),
        ],
      }),
    )
    expect(root.querySelector('.lg-panel__title')?.textContent).toBe('Hello')
    const buttons = [...root.querySelectorAll('.lg-button')]
    expect(buttons[0]?.textContent).toBe('Buy')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Buy')
    expect(buttons[1]?.textContent).toBe('Literal')
    dispose()
  })

  it('updates rendered text after a locale switch', async () => {
    const i18n = fakeI18n()
    const { root, dispose } = mount(() =>
      UiRoot({
        i18n: i18n.source,
        children: [
          Panel({ title: { key: 'greet' }, children: 'body' }),
          Button({ label: { key: 'buy' }, onClick: () => undefined }),
        ],
      }),
    )
    expect(root.querySelector('.lg-panel__title')?.textContent).toBe('Hello')
    i18n.setLocale('fr')
    await Promise.resolve()
    expect(root.querySelector('.lg-panel__title')?.textContent).toBe('Bonjour')
    expect(root.querySelector('.lg-button')?.textContent).toBe('Acheter')
    dispose()
  })

  it('falls back to the key when no resolver is installed', () => {
    const key: TextValue = { key: 'ui.missing' }
    expect(resolveText(key)).toBe('ui.missing')
    expect(resolveText('literal')).toBe('literal')
    expect(resolveText(undefined)).toBe('')
  })

  it('wires UiRoot scale, colorblind, contrast and font tokens', () => {
    const { root, dispose } = mount(() =>
      UiRoot({
        uiScale: 1.5,
        colorblind: true,
        contrast: 'high',
        theme: { font: 'Example Sans' },
        children: 'x',
      }),
    )
    const ui = root.querySelector<HTMLElement>('.lg-ui')
    expect(ui?.dataset['colorblind']).toBe('true')
    expect(ui?.dataset['contrast']).toBe('high')
    expect(ui?.style.getPropertyValue('--lg-ui-scale')).toBe('1.5')
    expect(ui?.style.getPropertyValue('--lg-font')).toBe('Example Sans')
    const variables = themeVariables({ colorblindAccent: 'var(--game-cvd)' })
    expect(variables['--lg-colorblind-accent']).toBe('var(--game-cvd)')
    dispose()
  })
})

describe('localized component a11y', () => {
  it('exposes describedby and localized tree labels', () => {
    const { root, dispose } = mount(() =>
      TreeView({
        nodes: [{ id: 'root', label: { key: 'arena.root' }, children: [{ id: 'a', label: 'A' }] }],
        expanded: ['root'],
        label: { key: 'arena.tree' },
        describedBy: 'tree-help',
      }),
    )
    const tree = root.querySelector('.lg-tree')
    expect(tree?.getAttribute('aria-describedby')).toBe('tree-help')
    expect(tree?.getAttribute('aria-label')).toBe('arena.tree')
    expect(root.querySelector('.lg-tree__label')?.textContent).toBe('arena.root')
    dispose()
  })

  it('activates shop actions from the keyboard without double firing', () => {
    const buy = vi.fn()
    const { root, dispose } = mount(() =>
      ShopRow({
        name: { key: 'item.name' },
        price: '10',
        buyLabel: { key: 'shop.buy' },
        sellLabel: 'Sell',
        onBuy: buy,
      }),
    )
    const button = root.querySelector<HTMLButtonElement>('.lg-shop-row__buy')
    expect(button?.textContent).toBe('shop.buy')
    button?.focus()
    button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(buy).toHaveBeenCalledTimes(1)
    button?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    expect(buy).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('selects dialog choices by keyboard with a description', () => {
    const chosen: string[] = []
    const { root, dispose } = mount(() =>
      Dialog({
        label: { key: 'dialog.title' },
        describedBy: 'dialog-help',
        text: { key: 'dialog.text' },
        choices: [
          { id: 'a', label: { key: 'dialog.a' } },
          { id: 'b', label: { key: 'dialog.b' } },
        ],
        onChoose: (id) => chosen.push(id),
      }),
    )
    const dialog = root.querySelector('.lg-dialog')
    expect(dialog?.getAttribute('aria-describedby')).toBe('dialog-help')
    expect(root.querySelector('.lg-dialog__text')?.textContent).toBe('dialog.text')
    const options = [...root.querySelectorAll<HTMLElement>('.lg-choices__item')]
    options[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    options[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(chosen).toEqual(['b'])
    dispose()
  })

  it('labels virtual list rows from the resolver', () => {
    const { root, dispose } = mount(() =>
      VirtualList({
        items: ['a', 'b'],
        rowHeight: 20,
        height: 40,
        renderRow: (item: string) => item,
        rowLabel: (item) => ({ key: `row.${item}` }),
        label: { key: 'list.label' },
        describedBy: 'list-help',
      }),
    )
    const rows = [...root.querySelectorAll('.lg-vlist__row')]
    expect(rows[0]?.getAttribute('aria-label')).toBe('row.a')
    expect(root.querySelector('.lg-vlist')?.getAttribute('aria-label')).toBe('list.label')
    expect(root.querySelector('.lg-vlist')?.getAttribute('aria-describedby')).toBe('list-help')
    dispose()
  })

  it('scrolls the virtual list from the keyboard', async () => {
    const items = Array.from({ length: 20 }, (_, index) => `row-${index}`)
    const { root, dispose } = mount(() =>
      VirtualList({
        items,
        rowHeight: 20,
        height: 40,
        overscan: 0,
        renderRow: (item: string) => item,
      }),
    )
    const list = root.querySelector<HTMLElement>('.lg-vlist')
    expect(list?.getAttribute('tabindex')).toBe('0')
    list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await Promise.resolve()
    expect(list?.scrollTop).toBe(20)
    expect(root.querySelector('.lg-vlist__row')?.textContent).toBe('row-1')
    dispose()
  })
})
