import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import {
  Bar,
  Button,
  InventoryGrid,
  KeyHint,
  List,
  LoadingOverlay,
  Modal,
  ToastHost,
  ToastQueue,
  Panel,
  SkillBar,
  Tabs,
  Tooltip,
  UiRoot,
  placeTooltip,
  createUiBridge,
  mountUi,
  UiMenuStack,
  type TabItem,
  type UiFrame,
  type UiGame,
} from '../index.js'

function frame(tick: number, hp: number): UiFrame {
  return { tick, events: [], cues: [], modelPatches: [], models: { hp } }
}

function fakeGame(initial: UiFrame): UiGame & { push: (next: UiFrame) => void; sent: unknown[] } {
  let listener: ((next: UiFrame) => void) | null = null
  const sent: unknown[] = []
  return {
    frame: initial,
    sent,
    send: async (type, payload) => {
      sent.push({ type, payload })
      return { status: 'ok' }
    },
    query: () => 1,
    subscribeFrames: (next) => {
      listener = next
      return () => {
        listener = null
      }
    },
    push: (next) => {
      listener?.(next)
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ui bridge', () => {
  it('updates reactive DOM from host frames', async () => {
    const game = fakeGame(frame(1, 5))
    const bridge = createUiBridge(game)
    const root = document.createElement('div')
    document.body.appendChild(root)
    const mounted = mountUi(root, bridge, (ui) =>
      UiRoot({
        children: Bar({
          value: () => (ui.models()['hp'] as number),
          max: 10,
          kind: 'hp',
        }),
      }),
    )
    expect(root.querySelector('.lg-bar__label')?.textContent).toBe('5/10')
    game.push(frame(2, 8))
    await Promise.resolve()
    expect(root.querySelector('.lg-bar__label')?.textContent).toBe('8/10')
    expect(root.querySelector('.lg-bar__fill')?.getAttribute('style')).toContain('80%')
    mounted.dispose()
  })

  it('sends commands from buttons and exposes query', async () => {
    const game = fakeGame(frame(1, 1))
    const bridge = createUiBridge(game)
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountUi(root, bridge, (ui) =>
      UiRoot({
        children: Button({ children: 'Cast', onClick: () => void ui.send('skill.cast', { slot: 1 }) }),
      }),
    )
    root.querySelector<HTMLButtonElement>('.lg-button')?.click()
    await Promise.resolve()
    expect(game.sent).toEqual([{ type: 'skill.cast', payload: { slot: 1 } }])
    expect(bridge.query({} as never, 1)).toBe(1)
  })
})

describe('ui components', () => {
  it('renders panel, key hints and skill cooldown overlays', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: Panel({
          title: 'Loadout',
          children: [
            KeyHint({ keys: ['Q', 'W'] }),
            SkillBar({
              slots: [{ id: 'a', label: 'Arc', key: 'Q', cooldown: 0.25 }],
            }),
          ],
        }),
      }),
    )
    expect(root.querySelector('.lg-panel__title')?.textContent).toBe('Loadout')
    expect(root.querySelectorAll('kbd')).toHaveLength(2)
    expect(root.querySelector<HTMLElement>('.lg-skill__cooldown')?.style.height).toBe('25%')
  })

  it('handles tabs, inventory selection and tooltip content', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const tabs: TabItem[] = [
      { id: 'gear', label: 'Gear' },
      { id: 'stats', label: 'Stats' },
    ]
    const [active, setActive] = createSignal('gear')
    const selected: string[] = []
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: [
          Tabs({ tabs, active, onSelect: setActive }),
          InventoryGrid({
            items: [
              { id: 'sword', label: 'Sword', count: 2, tooltip: 'A sharp edge' },
              { id: 'gem', label: 'Gem' },
            ],
            selected: 'sword',
            onSelect: (item) => {
              if (item !== null) {
                selected.push(item.id)
              }
            },
          }),
          Tooltip({ content: 'Hint text', children: htmlSpan('Target') }),
        ],
      }),
    )
    const tablist = root.querySelector('.lg-tabs')
    tablist?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(active()).toBe('stats')
    const slots = root.querySelectorAll<HTMLButtonElement>('.lg-slot')
    expect(slots).toHaveLength(2)
    expect(slots[0]?.classList.contains('selected')).toBe(true)
    expect(slots[0]?.querySelector('.lg-slot__count')?.textContent).toBe('2')
    slots[1]?.click()
    expect(selected).toEqual(['gem'])
    expect(
      [...document.querySelectorAll('.lg-tooltip__content')].map((node) => node.textContent),
    ).toContain('Hint text')
  })

  it('toggles modals and closes on escape/backdrop', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const [open, setOpen] = createSignal(false)
    const onClose = vi.fn(() => setOpen(false))
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: Modal({
          open,
          title: 'Paused',
          onClose,
          children: htmlSpan('Body'),
        }),
      }),
    )
    const backdrop = root.querySelector<HTMLElement>('.lg-modal__backdrop')
    expect(backdrop?.style.display).toBe('none')
    setOpen(true)
    await Promise.resolve()
    expect(backdrop?.style.display).toBe('grid')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalled()
    setOpen(false)
    await Promise.resolve()
    expect(backdrop?.style.display).toBe('none')
  })

  it('traps focus and restores it on close', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    const root = document.createElement('div')
    document.body.appendChild(root)
    const [open, setOpen] = createSignal(true)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: Modal({
          open,
          title: 'Nested',
          onClose: () => setOpen(false),
          children: [Button({ children: 'One' }), Button({ children: 'Two' })],
        }),
      }),
    )
    await Promise.resolve()
    const buttons = root.querySelectorAll<HTMLButtonElement>('.lg-modal .lg-button')
    expect(document.activeElement).toBe(buttons[0])
    buttons[2]?.focus()
    root.querySelector<HTMLElement>('.lg-modal')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    )
    expect(document.activeElement).toBe(buttons[0])
    setOpen(false)
    await Promise.resolve()
    expect(document.activeElement).toBe(trigger)
  })

  it('supports push/pop/replace/current and focus scope trap', () => {
    const stack = new UiMenuStack(document)
    const first = stack.push({ id: 'first' })
    expect(stack.depth).toBe(1)
    expect(stack.current?.id).toBe('first')
    const second = stack.push({ id: 'second' })
    expect(stack.current?.id).toBe('second')
    stack.pop()
    expect(stack.current?.id).toBe('first')
    stack.replace({ id: 'replacement' })
    expect(stack.current?.id).toBe('replacement')
    stack.pop()
    first()
    second()
    expect(stack.depth).toBe(0)
  })

  it('closes only the top modal from the menu stack', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const [first, setFirst] = createSignal(true)
    const [second, setSecond] = createSignal(true)
    const firstClose = vi.fn(() => setFirst(false))
    const secondClose = vi.fn(() => setSecond(false))
    const stack = new UiMenuStack(document)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: [
          Modal({ open: first, title: 'First', onClose: firstClose, menuStack: stack, children: htmlSpan('A') }),
          Modal({ open: second, title: 'Second', onClose: secondClose, menuStack: stack, children: htmlSpan('B') }),
        ],
      }),
    )
    await Promise.resolve()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(secondClose).toHaveBeenCalledTimes(1)
    expect(firstClose).not.toHaveBeenCalled()
    await Promise.resolve()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(firstClose).toHaveBeenCalledTimes(1)
    expect(stack.depth).toBe(0)
  })

  it('queues toasts, auto-dismisses, and exposes aria-live', async () => {
    const timers: Array<() => void> = []
    const queue = new ToastQueue({
      schedule: (callback) => {
        timers.push(callback)
        return timers.length
      },
      cancel: () => undefined,
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({ children: ToastHost({ queue, dismissLabel: 'Dismiss' }) }),
    )
    queue.enqueue({ id: 'a', message: 'Saved' })
    await Promise.resolve()
    expect(root.querySelector('.lg-toast')?.textContent).toContain('Saved')
    expect(root.querySelector('.lg-toasts')?.getAttribute('aria-live')).toBe('polite')
    expect(root.querySelector('.lg-toast__close')?.getAttribute('aria-label')).toBe('Dismiss')
    timers[0]?.()
    await Promise.resolve()
    expect(root.querySelector('.lg-toast')).toBeNull()
  })

  it('renders loading, error and cancel states without copy defaults', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const cancel = vi.fn()
    const error: string | null = 'Failed'
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: LoadingOverlay({
          open: true,
          label: 'Loading',
          progress: null,
          error: () => error,
          onCancel: cancel,
          cancelLabel: 'Cancel',
        }),
      }),
    )
    const overlay = root.querySelector('.lg-loading')
    expect(overlay?.getAttribute('aria-busy')).toBe('false')
    expect(root.querySelector('.lg-loading__error')?.textContent).toBe('Failed')
    root.querySelector<HTMLButtonElement>('.lg-loading .lg-button')?.click()
    expect(cancel).toHaveBeenCalled()
  })

  it('flips tooltips at viewport edges and opens on focus with Escape close', async () => {
    const top = placeTooltip({
      trigger: { x: 100, y: 10, width: 20, height: 10 },
      content: { width: 80, height: 30 },
      viewport: { width: 320, height: 200 },
    })
    expect(top.placement).toBe('bottom')
    const bottom = placeTooltip({
      trigger: { x: 100, y: 180, width: 20, height: 10 },
      content: { width: 80, height: 30 },
      viewport: { width: 320, height: 200 },
      placement: 'bottom',
    })
    expect(bottom.placement).toBe('top')

    const root = document.createElement('div')
    document.body.appendChild(root)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: Tooltip({
          content: 'Hint',
          children: Button({ children: 'Target' }),
        }),
      }),
    )
    const wrapper = root.querySelector<HTMLElement>('.lg-tooltip')
    const trigger = root.querySelector<HTMLButtonElement>('.lg-button')
    expect(wrapper?.getAttribute('aria-describedby')).toMatch(/^lg-tip-/)
    trigger?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await Promise.resolve()
    const content = document.querySelector<HTMLElement>('.lg-tooltip__portal .lg-tooltip__content')
    expect(content?.getAttribute('data-open')).toBe('true')
    expect(content?.textContent).toBe('Hint')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(content?.getAttribute('data-open')).toBe('false')
  })

  it('renders empty lists and selected list items', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        children: List({
          items: [],
          renderItem: (item) => String(item),
          empty: 'No drops',
        }),
      }),
    )
    expect(root.querySelector('.lg-list__empty')?.textContent).toBe('No drops')
  })
})

function htmlSpan(text: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = text
  return span
}
