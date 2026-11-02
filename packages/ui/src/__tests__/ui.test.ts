import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import {
  Bar,
  Button,
  InventoryGrid,
  KeyHint,
  List,
  Modal,
  Panel,
  SkillBar,
  Tabs,
  Tooltip,
  UiRoot,
  createUiBridge,
  mountUi,
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
      [...root.querySelectorAll('.lg-tooltip__content')].map((node) => node.textContent),
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
