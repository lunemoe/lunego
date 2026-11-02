import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import {
  List,
  Modal,
  UiMenuStack,
  createUiBridge,
  mountUi,
  type UiGame,
  type UiNode,
} from '../index.js'

function gameStub(): UiGame {
  return {
    frame: { tick: 0, events: [], cues: [], modelPatches: [], models: {} },
    send: async () => ({}),
    query: ((_query: unknown, _args: unknown) => 0) as UiGame['query'],
  }
}

function mount(view: () => UiNode): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  mountUi(root, createUiBridge(gameStub()), view)
  return root
}

function key(target: Element, value: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function options(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="option"]')]
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('accessible List', () => {
  it('exposes listbox/option semantics and moves with roving focus', async () => {
    const [selected, setSelected] = createSignal<number | null>(0)
    const picked: number[] = []
    const root = mount(() =>
      List({
        items: ['Alpha', 'Beta', 'Gamma'],
        renderItem: (item: string) => item,
        selected,
        onSelect: (_item, index) => {
          picked.push(index)
          setSelected(index)
        },
        label: 'Rewards',
      }),
    )
    await Promise.resolve()
    const list = root.querySelector<HTMLElement>('.lg-list')
    const items = options(root)
    expect(list?.getAttribute('role')).toBe('listbox')
    expect(list?.getAttribute('aria-label')).toBe('Rewards')
    expect(list?.getAttribute('aria-orientation')).toBe('vertical')
    expect(items.map((item) => item.getAttribute('role'))).toEqual(['option', 'option', 'option'])
    expect(items[0]?.getAttribute('aria-selected')).toBe('true')
    expect(items[0]?.tabIndex).toBe(0)

    items[0]?.focus()
    key(list as HTMLElement, 'ArrowDown')
    expect(document.activeElement).toBe(items[1])
    key(list as HTMLElement, 'ArrowDown')
    expect(document.activeElement).toBe(items[2])
    key(list as HTMLElement, 'ArrowDown')
    expect(document.activeElement).toBe(items[2])
    key(list as HTMLElement, 'ArrowUp')
    expect(document.activeElement).toBe(items[1])
    key(list as HTMLElement, 'Home')
    expect(document.activeElement).toBe(items[0])
    key(list as HTMLElement, 'End')
    expect(document.activeElement).toBe(items[2])

    key(list as HTMLElement, 'Enter')
    expect(picked).toEqual([2])
    await Promise.resolve()
    expect(items[2]?.getAttribute('aria-selected')).toBe('true')
    key(list as HTMLElement, ' ')
    expect(picked).toEqual([2, 2])
  })

  it('skips disabled options and ignores their clicks', async () => {
    const picked: number[] = []
    const root = mount(() =>
      List({
        items: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        renderItem: (item: string) => item,
        selected: 0,
        onSelect: (_item, index) => picked.push(index),
        isDisabled: (item) => item === 'Beta',
      }),
    )
    await Promise.resolve()
    const list = root.querySelector<HTMLElement>('.lg-list') as HTMLElement
    const items = options(root)
    expect(items[1]?.getAttribute('aria-disabled')).toBe('true')
    expect(items[1]?.tabIndex).toBe(-1)

    items[0]?.focus()
    key(list, 'ArrowDown')
    expect(document.activeElement).toBe(items[2])
    key(list, 'End')
    expect(document.activeElement).toBe(items[3])
    key(list, 'ArrowUp')
    expect(document.activeElement).toBe(items[2])
    key(list, 'Home')
    expect(document.activeElement).toBe(items[0])

    items[1]?.click()
    expect(picked).toEqual([])
    key(list, 'Enter')
    expect(picked).toEqual([0])
  })

  it('handles empty lists without throwing or stealing keys', async () => {
    const onSelect = vi.fn()
    const root = mount(() =>
      List({
        items: [] as string[],
        renderItem: (item: string) => item,
        empty: 'No items',
        label: 'Loot',
        onSelect,
      }),
    )
    await Promise.resolve()
    const list = root.querySelector<HTMLElement>('.lg-list') as HTMLElement
    expect(list.getAttribute('role')).toBe('listbox')
    expect(list.getAttribute('aria-label')).toBe('Loot')
    expect(list.tabIndex).toBe(0)
    expect(root.querySelector('.lg-list__empty')?.textContent).toBe('No items')
    expect(options(root)).toHaveLength(0)
    expect(() => key(list, 'ArrowDown')).not.toThrow()
    key(list, 'Enter')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('leaves editable descendants and selection shortcuts alone', async () => {
    const picked: number[] = []
    const root = mount(() =>
      List({
        items: ['field', 'Beta'],
        renderItem: (item: string) => {
          if (item !== 'field') {
            return item
          }
          const input = document.createElement('input')
          input.className = 'probe-input'
          return input
        },
        selected: 0,
        onSelect: (_item, index) => picked.push(index),
      }),
    )
    await Promise.resolve()
    const input = root.querySelector<HTMLInputElement>('.probe-input') as HTMLInputElement
    input.focus()
    key(input, 'ArrowDown')
    key(input, 'Enter')
    input.click()
    expect(document.activeElement).toBe(input)
    expect(picked).toEqual([])

    const list = root.querySelector<HTMLElement>('.lg-list') as HTMLElement
    const shortcut = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    list.dispatchEvent(shortcut)
    expect(shortcut.defaultPrevented).toBe(false)
    const escape = key(list, 'Escape')
    expect(escape.defaultPrevented).toBe(false)
    expect(picked).toEqual([])
  })

  it('leaves Escape to the enclosing menu stack and restores focus on close', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    const [open, setOpen] = createSignal(true)
    const onClose = vi.fn(() => setOpen(false))
    const stack = new UiMenuStack(document)
    const root = mount(() =>
      Modal({
        open,
        title: 'Choices',
        onClose,
        menuStack: stack,
        children: List({
          items: ['Alpha', 'Beta'],
          renderItem: (item: string) => item,
          onSelect: () => undefined,
        }),
      }),
    )
    await Promise.resolve()
    const items = options(root)
    items[0]?.focus()
    const event = key(items[0] as HTMLElement, 'Escape')
    expect(event.key).toBe('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(document.activeElement).toBe(trigger)
  })

  it('removes its document key listener when the menu stack empties', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const stack = new UiMenuStack(document)
    stack.push({ id: 'layer' })
    expect(add.mock.calls.some(([type]) => type === 'keydown')).toBe(true)
    stack.pop()
    expect(remove.mock.calls.some(([type]) => type === 'keydown')).toBe(true)
    add.mockRestore()
    remove.mockRestore()
  })
})
