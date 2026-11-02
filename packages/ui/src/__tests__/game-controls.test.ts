import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import {
  ChoiceList,
  Dialog,
  DragSource,
  DropTarget,
  EquipmentSlots,
  GraphView,
  MinimapView,
  PagedText,
  ShopRow,
  SortableGrid,
  TreeView,
  UiRoot,
  VirtualList,
  beginDrag,
  createUiBridge,
  endDrag,
  mountUi,
  projectMinimapPoint,
  type DragDropEvent,
  type TreeItemData,
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
  mountUi(root, createUiBridge(gameStub()), () => UiRoot({ children: view() }))
  return root
}

function key(target: Element, value: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
}

function dragEvent(target: Element, type: string): void {
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  endDrag()
  document.body.innerHTML = ''
})

describe('drag controls', () => {
  it('drops a dragged sortable item and reports only from/to/itemId', () => {
    const drops: DragDropEvent[] = []
    const root = mount(() =>
      SortableGrid({
        items: ['a', 'b', 'c'],
        itemId: (item: string) => item,
        source: 'grid',
        onDrop: (event) => drops.push(event),
      }),
    )
    const cells = [...root.querySelectorAll<HTMLElement>('.lg-sortable__cell')]
    expect(cells).toHaveLength(3)
    dragEvent(cells[0] as HTMLElement, 'dragstart')
    dragEvent(cells[2] as HTMLElement, 'dragover')
    dragEvent(cells[2] as HTMLElement, 'drop')
    expect(drops).toEqual([{ itemId: 'a', from: 'grid', to: 'grid/2' }])
  })

  it('moves through the grid with the keyboard', () => {
    const drops: DragDropEvent[] = []
    const root = mount(() =>
      SortableGrid({
        items: ['a', 'b', 'c'],
        itemId: (item: string) => item,
        source: 'grid',
        columns: 3,
        onDrop: (event) => drops.push(event),
      }),
    )
    const cells = [...root.querySelectorAll<HTMLElement>('.lg-sortable__cell')]
    expect(cells[0]?.getAttribute('aria-grabbed')).toBe('false')
    key(cells[0] as HTMLElement, ' ')
    expect(cells[0]?.getAttribute('aria-grabbed')).toBe('true')
    key(cells[0] as HTMLElement, 'ArrowRight')
    expect(cells[1]?.classList.contains('lg-sortable__cell--target')).toBe(true)
    key(cells[0] as HTMLElement, ' ')
    expect(drops).toEqual([{ itemId: 'a', from: 'grid', to: 'grid/1' }])
    expect(cells[0]?.getAttribute('aria-grabbed')).toBe('false')
  })

  it('drops a DragSource onto a DropTarget', () => {
    const drops: DragDropEvent[] = []
    const root = mount(() => [
      DragSource({ itemId: 'sword', from: 'bag', label: 'Sword', children: 'S' }),
      DropTarget({
        target: 'hand',
        focusable: true,
        label: 'Hand',
        onDrop: (event) => drops.push(event),
        children: 'H',
      }),
    ])
    dragEvent(root.querySelector('.lg-drag') as HTMLElement, 'dragstart')
    dragEvent(root.querySelector('.lg-drop') as HTMLElement, 'drop')
    expect(drops).toEqual([{ itemId: 'sword', from: 'bag', to: 'hand' }])
  })
})

describe('virtual list', () => {
  it('only renders the visible window and follows scrolling', async () => {
    const items = Array.from({ length: 1000 }, (_, index) => `row-${index}`)
    const root = mount(() =>
      VirtualList({
        items,
        rowHeight: 20,
        height: 100,
        renderRow: (item: string) => item,
      }),
    )
    const list = root.querySelector<HTMLElement>('.lg-vlist')
    const initial = [...root.querySelectorAll<HTMLElement>('.lg-vlist__row')]
    expect(initial.length).toBeGreaterThan(0)
    expect(initial.length).toBeLessThanOrEqual(8)
    expect(initial[0]?.textContent).toBe('row-0')

    if (list !== null) {
      list.scrollTop = 500
      list.dispatchEvent(new Event('scroll'))
    }
    await Promise.resolve()
    const scrolled = [...root.querySelectorAll<HTMLElement>('.lg-vlist__row')]
    expect(scrolled.length).toBeLessThanOrEqual(8)
    expect(scrolled[0]?.textContent).toBe('row-24')
  })
})

describe('equipment slots', () => {
  it('accepts drops and moves focus with arrow keys', () => {
    const drops: DragDropEvent[] = []
    const root = mount(() =>
      EquipmentSlots({
        slots: [
          { id: 'hand', label: 'Hand' },
          { id: 'head', label: 'Head' },
        ],
        emptyLabel: 'Empty',
        columns: 2,
        onDrop: (event) => drops.push(event),
      }),
    )
    const slots = [...root.querySelectorAll<HTMLElement>('.lg-equipment__slot')]
    expect(root.querySelectorAll('.lg-equipment__empty')).toHaveLength(2)

    key(slots[0] as HTMLElement, 'ArrowRight')
    expect(document.activeElement).toBe(slots[1])

    beginDrag({ itemId: 'helm', from: 'bag' })
    dragEvent(slots[1] as HTMLElement, 'dragover')
    dragEvent(slots[1] as HTMLElement, 'drop')
    expect(drops).toEqual([{ itemId: 'helm', from: 'bag', to: 'head' }])
  })
})

describe('tree view', () => {
  const nodes: TreeItemData[] = [
    {
      id: 'root',
      label: 'Root',
      children: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    },
  ]

  it('navigates with arrows and toggles branches', () => {
    const selected: string[] = []
    const toggles: Array<[string, boolean]> = []
    const [expanded, setExpanded] = createSignal<readonly string[]>(['root'])
    const root = mount(() =>
      TreeView({
        nodes,
        expanded,
        onToggle: (id, next) => {
          toggles.push([id, next])
          setExpanded(next ? [...expanded(), id] : expanded().filter((entry) => entry !== id))
        },
        onSelect: (id) => selected.push(id),
      }),
    )
    const items = [...root.querySelectorAll<HTMLElement>('.lg-tree__item')]
    expect(items).toHaveLength(3)
    expect(items[0]?.getAttribute('role')).toBe('treeitem')
    expect(items[0]?.getAttribute('aria-expanded')).toBe('true')

    key(items[0] as HTMLElement, 'ArrowDown')
    expect(document.activeElement?.getAttribute('data-node-id')).toBe('a')
    key(items[1] as HTMLElement, 'ArrowLeft')
    expect(document.activeElement?.getAttribute('data-node-id')).toBe('root')
    key(items[0] as HTMLElement, 'Enter')
    expect(selected).toEqual(['root'])
    key(items[0] as HTMLElement, 'ArrowLeft')
    expect(toggles).toContainEqual(['root', false])
  })
})

describe('dialogue controls', () => {
  it('commits a dialog choice exactly once', () => {
    const chosen: string[] = []
    const root = mount(() =>
      Dialog({
        speaker: 'Guide',
        text: 'Choose',
        choices: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        onChoose: (id) => chosen.push(id),
      }),
    )
    const options = [...root.querySelectorAll<HTMLElement>('.lg-choices__item')]
    options[0]?.click()
    options[0]?.click()
    expect(chosen).toEqual(['yes'])
    expect(options[0]?.getAttribute('aria-disabled')).toBe('true')
  })

  it('selects a choice with the keyboard', () => {
    const chosen: string[] = []
    const root = mount(() =>
      ChoiceList({
        choices: [
          { id: 'one', label: 'One' },
          { id: 'two', label: 'Two' },
        ],
        onChoose: (id) => chosen.push(id),
      }),
    )
    const options = [...root.querySelectorAll<HTMLElement>('.lg-choices__item')]
    key(options[0] as HTMLElement, 'ArrowDown')
    key(options[1] as HTMLElement, 'Enter')
    expect(chosen).toEqual(['two'])
  })

  it('pages text through caller labels', () => {
    const pages: number[] = []
    const root = mount(() =>
      PagedText({
        pages: ['First', 'Second'],
        prevLabel: 'Back',
        nextLabel: 'Next',
        onPageChange: (index) => pages.push(index),
      }),
    )
    expect(root.querySelector('.lg-paged__text')?.textContent).toBe('First')
    root.querySelector<HTMLButtonElement>('.lg-paged__next')?.click()
    expect(pages).toEqual([1])
    expect(root.querySelector('.lg-paged__text')?.textContent).toBe('Second')
  })
})

describe('shop row', () => {
  it('renders supplied values and routes buy/sell callbacks', () => {
    const bought = vi.fn()
    const sold = vi.fn()
    const root = mount(() =>
      ShopRow({
        name: 'Potion',
        price: '10',
        quantity: 2,
        buyLabel: 'Buy',
        sellLabel: 'Sell',
        onBuy: bought,
        onSell: sold,
      }),
    )
    expect(root.querySelector('.lg-shop-row__name')?.textContent).toBe('Potion')
    expect(root.querySelector('.lg-shop-row__price')?.textContent).toBe('10')
    expect(root.querySelector('.lg-shop-row__quantity')?.textContent).toBe('2')
    root.querySelector<HTMLButtonElement>('.lg-shop-row__buy')?.click()
    root.querySelector<HTMLButtonElement>('.lg-shop-row__sell')?.click()
    expect(bought).toHaveBeenCalledTimes(1)
    expect(sold).toHaveBeenCalledTimes(1)
  })

  it('disables actions without handlers', () => {
    const root = mount(() =>
      ShopRow({ name: 'Empty', price: 0, buyLabel: 'Buy', sellLabel: 'Sell' }),
    )
    expect(root.querySelector<HTMLButtonElement>('.lg-shop-row__buy')?.disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('.lg-shop-row__sell')?.disabled).toBe(true)
  })
})

describe('minimap', () => {
  it('projects world points into a square minimap', () => {
    expect(
      projectMinimapPoint({ x: 500, y: 250 }, { map: { width: 1000, height: 500 }, size: 200 }),
    ).toEqual({ x: 100, y: 100, visible: true })
    const outside = projectMinimapPoint(
      { x: 2000, y: 250 },
      { map: { width: 1000, height: 500 }, size: 200 },
    )
    expect(outside.visible).toBe(false)
    expect(outside.x).toBe(200)
  })

  it('renders markers up to the cap and projects the player', () => {
    const markers = Array.from({ length: 100 }, (_, index) => ({
      id: `m${index}`,
      x: index * 10,
      y: index * 5,
    }))
    const root = mount(() =>
      MinimapView({
        map: { width: 1000, height: 500 },
        size: 200,
        markers,
        maxMarkers: 10,
        player: { x: 500, y: 250, rotation: 45 },
        label: 'Map',
      }),
    )
    const rendered = [...root.querySelectorAll<HTMLElement>('.lg-minimap__marker')]
    expect(rendered).toHaveLength(10)
    expect(rendered[0]?.style.left).toBe('0px')
    expect(rendered[0]?.style.top).toBe('50px')
    expect(root.querySelector('.lg-minimap__player')).not.toBeNull()
  })
})

describe('graph view', () => {
  it('renders nodes/edges and supports selection, focus and zoom', () => {
    const selected: string[] = []
    const root = mount(() =>
      GraphView({
        nodes: [
          { id: 'a', label: 'A', x: 10, y: 10 },
          { id: 'b', label: 'B', x: 80, y: 40 },
        ],
        edges: [{ from: 'a', to: 'b' }],
        onSelect: (id) => selected.push(id),
      }),
    )
    expect(root.querySelectorAll('.lg-graph__node')).toHaveLength(2)
    expect(root.querySelectorAll('.lg-graph__edge')).toHaveLength(1)
    root.querySelector<HTMLButtonElement>('.lg-graph__node')?.click()
    expect(selected).toEqual(['a'])
    key(root.querySelector('.lg-graph__viewport') as HTMLElement, '+')
    expect(root.querySelector<HTMLElement>('.lg-graph__canvas')?.style.transform).toContain('scale(1.1)')
  })
})
