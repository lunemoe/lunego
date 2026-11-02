export interface FocusScopeOptions {
  readonly element: HTMLElement
  readonly initialFocus?: HTMLElement | null
  readonly restoreFocus?: HTMLElement | null
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Traps Tab inside one element and restores the previously focused element. */
export class FocusScope {
  private readonly element: HTMLElement
  private readonly initialFocus: HTMLElement | null
  private readonly restoreTarget: HTMLElement | null
  private active = false

  constructor(options: FocusScopeOptions) {
    this.element = options.element
    this.initialFocus = options.initialFocus ?? null
    this.restoreTarget = options.restoreFocus ?? (
      typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
    )
  }

  get isActive(): boolean {
    return this.active
  }

  focusable(): readonly HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE)]
  }

  activate(): void {
    if (this.active) {
      return
    }
    this.active = true
    const target = this.initialFocus ?? this.focusable()[0] ?? this.element
    target.focus?.()
  }

  deactivate(): void {
    if (!this.active) {
      return
    }
    this.active = false
    this.restoreTarget?.focus?.()
  }

  /** Returns true when the event was handled (focus moved or focus wrapped). */
  trap(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab') {
      return false
    }
    const focusable = this.focusable()
    if (focusable.length === 0) {
      event.preventDefault?.()
      this.element.focus?.()
      return true
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (first === undefined || last === undefined) {
      return false
    }
    const current = (typeof document === 'undefined' ? null : document.activeElement)
    if (event.shiftKey === true) {
      if (current === first || !this.element.contains(current)) {
        event.preventDefault?.()
        last.focus?.()
        return true
      }
    } else if (current === last || !this.element.contains(current)) {
      event.preventDefault?.()
      first.focus?.()
      return true
    }
    return false
  }
}

export interface MenuLayer {
  readonly id?: string
  readonly element?: HTMLElement | (() => HTMLElement | undefined)
  readonly initialFocus?: HTMLElement | null
  readonly restoreFocus?: HTMLElement | null
  readonly onClose?: () => void
}

interface LayerEntry {
  readonly layer: MenuLayer
  readonly scope: FocusScope | null
}

type KeyboardTarget = Pick<Document, 'addEventListener' | 'removeEventListener'>

/** Stack of modal/menu layers. Only the top layer receives Escape/Tab. */
export class UiMenuStack {
  private readonly entries: LayerEntry[] = []
  private readonly listeners = new Set<() => void>()
  private readonly target: KeyboardTarget | null
  private listening = false

  constructor(target?: KeyboardTarget | null) {
    this.target = target === undefined
      ? (typeof document === 'undefined' ? null : document)
      : target
  }

  get depth(): number {
    return this.entries.length
  }

  get current(): MenuLayer | null {
    return this.entries[this.entries.length - 1]?.layer ?? null
  }

  push(layer: MenuLayer): () => void {
    const element = typeof layer.element === 'function' ? layer.element() : layer.element
    const scope = element === undefined || element === null
      ? null
      : new FocusScope({
          element,
          initialFocus: layer.initialFocus ?? null,
          restoreFocus: layer.restoreFocus ?? null,
        })
    this.entries.push({ layer, scope })
    scope?.activate()
    this.ensureListener()
    this.notify()
    return () => this.pop(layer)
  }

  pop(layer?: MenuLayer): void {
    const entry = this.entries[this.entries.length - 1]
    if (entry === undefined || (layer !== undefined && entry.layer !== layer)) {
      return
    }
    this.entries.pop()
    entry.scope?.deactivate()
    this.syncListener()
    this.notify()
  }

  replace(layer: MenuLayer): void {
    const entry = this.entries[this.entries.length - 1]
    if (entry === undefined) {
      this.push(layer)
      return
    }
    this.entries.pop()
    entry.scope?.deactivate()
    this.push(layer)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private ensureListener(): void {
    if (this.listening || this.target === null) {
      return
    }
    this.target.addEventListener('keydown', this.onKeyDown as EventListener)
    this.listening = true
  }

  private syncListener(): void {
    if (this.entries.length > 0 || !this.listening || this.target === null) {
      return
    }
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener)
    this.listening = false
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const entry = this.entries[this.entries.length - 1]
    if (entry === undefined) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault?.()
      event.stopPropagation?.()
      entry.layer.onClose?.()
      return
    }
    entry.scope?.trap(event)
  }
}

export const defaultMenuStack = new UiMenuStack()
