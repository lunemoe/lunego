import { createMemo, createSignal } from 'solid-js'
import html from 'solid-js/html'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface TreeItemData {
  readonly id: string
  /** Localized label supplied by the caller. */
  readonly label: string
  readonly children?: readonly TreeItemData[]
  readonly disabled?: boolean
  readonly icon?: string | null
}

export interface FlatTreeItem {
  readonly node: TreeItemData
  readonly depth: number
  readonly parentId: string | null
}

/** Flatten only visible nodes (children of collapsed nodes are omitted). */
export function flattenTree(
  nodes: readonly TreeItemData[],
  expanded: readonly string[],
): FlatTreeItem[] {
  const isOpen = new Set(expanded)
  const visible: FlatTreeItem[] = []
  const visit = (list: readonly TreeItemData[], depth: number, parentId: string | null): void => {
    for (const node of list) {
      visible.push({ node, depth, parentId })
      if (node.children !== undefined && node.children.length > 0 && isOpen.has(node.id)) {
        visit(node.children, depth + 1, node.id)
      }
    }
  }
  visit(nodes, 0, null)
  return visible
}

export interface TreeViewProps {
  readonly nodes: UiValue<readonly TreeItemData[]>
  readonly selected?: UiValue<string | null>
  readonly expanded?: UiValue<readonly string[]>
  readonly onSelect?: (id: string) => void
  readonly onToggle?: (id: string, expanded: boolean) => void
  readonly label?: string
  readonly emptyLabel?: string
}

/** Accessible tree with roving focus and Arrow/Home/End/Enter navigation. */
export function TreeView(props: TreeViewProps): UiNode {
  const [internalSelected, setInternalSelected] = createSignal<string | null>(null)
  const [internalExpanded, setInternalExpanded] = createSignal<readonly string[]>([])
  const [focusId, setFocusId] = createSignal<string | null>(null)
  const elements = new Map<string, HTMLElement>()

  const expandedIds = () =>
    props.expanded === undefined ? internalExpanded() : readValue(props.expanded)
  const selectedId = () =>
    props.selected === undefined ? internalSelected() : readValue(props.selected)
  const visible = createMemo(() => flattenTree(readValue(props.nodes), expandedIds()))
  const activeId = () => {
    const current = focusId()
    if (current !== null && visible().some((entry) => entry.node.id === current)) {
      return current
    }
    return visible()[0]?.node.id ?? null
  }

  const focusNode = (id: string): void => {
    setFocusId(id)
    elements.get(id)?.focus()
  }
  const select = (node: TreeItemData): void => {
    if (node.disabled === true) {
      return
    }
    if (props.selected === undefined) {
      setInternalSelected(node.id)
    }
    props.onSelect?.(node.id)
  }
  const setExpanded = (id: string, next: boolean): void => {
    const list = expandedIds()
    if (props.expanded === undefined) {
      setInternalExpanded(next ? [...list, id] : list.filter((entry) => entry !== id))
    }
    props.onToggle?.(id, next)
  }
  const moveFocus = (delta: number): void => {
    const list = visible()
    if (list.length === 0) {
      return
    }
    const current = list.findIndex((entry) => entry.node.id === activeId())
    const index = Math.max(0, Math.min((current < 0 ? 0 : current) + delta, list.length - 1))
    const target = list[index]
    if (target !== undefined) {
      focusNode(target.node.id)
    }
  }
  const onKeyDown = (entry: FlatTreeItem, event: KeyboardEvent): void => {
    const { node } = entry
    const hasChildren = node.children !== undefined && node.children.length > 0
    const isOpen = expandedIds().includes(node.id)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      const first = visible()[0]
      if (first !== undefined) {
        focusNode(first.node.id)
      }
    } else if (event.key === 'End') {
      event.preventDefault()
      const last = visible()[visible().length - 1]
      if (last !== undefined) {
        focusNode(last.node.id)
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (hasChildren && !isOpen) {
        setExpanded(node.id, true)
      } else if (hasChildren) {
        const firstChild = node.children?.[0]
        if (firstChild !== undefined) {
          focusNode(firstChild.id)
        }
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (hasChildren && isOpen) {
        setExpanded(node.id, false)
      } else if (entry.parentId !== null) {
        focusNode(entry.parentId)
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(node)
    }
  }

  return html`<ul class="lg-tree" role="tree" aria-label=${() => props.label ?? ''}>
    ${() => {
      if (visible().length === 0) {
        return html`<li class="lg-tree__empty">${props.emptyLabel ?? ''}</li>`
      }
      return visible().map((entry) => {
        const { node, depth } = entry
        const hasChildren = node.children !== undefined && node.children.length > 0
        const isOpen = expandedIds().includes(node.id)
        return html`<li class=${() => {
          const classes = ['lg-tree__item']
          if (selectedId() === node.id) {
            classes.push('lg-tree__item--selected')
          }
          if (node.disabled === true) {
            classes.push('lg-tree__item--disabled')
          }
          return classes.join(' ')
        }}
          role="treeitem"
          aria-level=${depth + 1}
          aria-expanded=${hasChildren ? String(isOpen) : undefined}
          aria-selected=${() => String(selectedId() === node.id)}
          aria-disabled=${node.disabled === true ? 'true' : undefined}
          data-node-id=${node.id}
          tabIndex=${() => (activeId() === node.id ? 0 : -1)}
          ref=${(element: HTMLElement) => {
            elements.set(node.id, element)
          }}
          onClick=${() => select(node)}
          onKeyDown=${(event: KeyboardEvent) => onKeyDown(entry, event)}>
          <span class="lg-tree__indent" aria-hidden="true"
            style=${{ width: `calc(var(--lg-space-lg) * ${depth})` }}></span>
          ${hasChildren
            ? html`<span class="lg-tree__toggle" aria-hidden="true"
                data-expanded=${String(isOpen)}
                onClick=${(event: MouseEvent) => {
                  event.stopPropagation()
                  setExpanded(node.id, !isOpen)
                }}></span>`
            : html`<span class="lg-tree__toggle lg-tree__toggle--leaf" aria-hidden="true"></span>`}
          ${node.icon !== undefined && node.icon !== null
            ? html`<img class="lg-tree__icon" src=${node.icon} alt="" draggable="false" />`
            : null}
          <span class="lg-tree__label">${node.label}</span>
        </li>`
      })
    }}
  </ul>`
}
