import { createEffect, createSignal, onCleanup } from 'solid-js'
import html from 'solid-js/html'
import type { UiChild, UiNode } from './ui-types.js'

export interface ToastItem {
  readonly id: string
  readonly message: UiChild
  readonly durationMs?: number
  /** Localized accessible label for the dismiss button. */
  readonly dismissLabel?: string
}

export interface ToastQueueOptions {
  readonly durationMs?: number
  readonly limit?: number
  readonly schedule?: (callback: () => void, delayMs: number) => unknown
  readonly cancel?: (handle: unknown) => void
}

/** Timed FIFO toast queue; timing is injectable for deterministic tests. */
export class ToastQueue {
  private readonly itemsValue: ToastItem[] = []
  private readonly listeners = new Set<() => void>()
  private readonly timers = new Map<string, unknown>()
  private readonly durationMs: number
  private readonly limit: number
  private readonly schedule: (callback: () => void, delayMs: number) => unknown
  private readonly cancel: (handle: unknown) => void

  constructor(options: ToastQueueOptions = {}) {
    this.durationMs = options.durationMs ?? 4000
    this.limit = options.limit ?? 4
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  get items(): readonly ToastItem[] {
    return [...this.itemsValue]
  }

  enqueue(item: ToastItem): () => void {
    if (this.itemsValue.some((entry) => entry.id === item.id)) {
      return () => this.dismiss(item.id)
    }
    this.itemsValue.push(item)
    while (this.itemsValue.length > this.limit) {
      const removed = this.itemsValue.shift()
      if (removed !== undefined) {
        this.clearTimer(removed.id)
      }
    }
    const duration = item.durationMs ?? this.durationMs
    if (duration > 0) {
      const handle = this.schedule(() => this.dismiss(item.id), duration)
      this.timers.set(item.id, handle)
    }
    this.notify()
    return () => this.dismiss(item.id)
  }

  dismiss(id: string): void {
    const index = this.itemsValue.findIndex((entry) => entry.id === id)
    if (index < 0) {
      return
    }
    this.itemsValue.splice(index, 1)
    this.clearTimer(id)
    this.notify()
  }

  clear(): void {
    for (const id of [...this.timers.keys()]) {
      this.clearTimer(id)
    }
    this.itemsValue.length = 0
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private clearTimer(id: string): void {
    const handle = this.timers.get(id)
    if (handle !== undefined) {
      this.cancel(handle)
      this.timers.delete(id)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export interface ToastHostProps {
  readonly queue: ToastQueue
  readonly live?: 'polite' | 'assertive'
  readonly dismissLabel?: string
}

export function ToastHost(props: ToastHostProps): UiNode {
  const [items, setItems] = createSignal<readonly ToastItem[]>(props.queue.items)
  createEffect(() => {
    const dispose = props.queue.subscribe(() => setItems(props.queue.items))
    onCleanup(dispose)
  })
  return html`<div class="lg-toasts" aria-live=${props.live ?? 'polite'} aria-atomic="true">
    ${() => items().map((item) => html`<div class="lg-toast" role="status">
      <span class="lg-toast__message">${item.message}</span>
      <button class="lg-toast__close" aria-label=${item.dismissLabel ?? props.dismissLabel ?? ''}
        onClick=${() => props.queue.dismiss(item.id)}>×</button>
    </div>`)}
  </div>`
}

export interface LoadingOverlayProps {
  readonly open: boolean
  readonly label?: UiChild
  readonly progress?: number | null
  readonly error?: UiChild | null
  readonly onCancel?: () => void
  readonly cancelLabel?: string
}

export function LoadingOverlay(props: LoadingOverlayProps): UiNode {
  return html`<div class="lg-loading" style=${{ display: props.open ? 'grid' : 'none' }}
    role="dialog" aria-modal="true" aria-busy=${() => String(props.error === undefined || props.error === null)}
    aria-label=${typeof props.label === 'string' ? props.label : ''}>
    <div class="lg-loading__panel lg-panel">
      <div class="lg-loading__label">${props.label ?? ''}</div>
      ${props.progress === null || props.progress === undefined
        ? null
        : html`<progress class="lg-loading__progress" max="1" value=${props.progress}></progress>`}
      ${props.error === undefined || props.error === null
        ? null
        : html`<div class="lg-loading__error" role="alert">${props.error}</div>`}
      ${props.onCancel === undefined
        ? null
        : html`<button class="lg-button" onClick=${() => props.onCancel?.()}>${props.cancelLabel ?? ''}</button>`}
    </div>
  </div>`
}
