import { describe, expect, it } from 'vitest'
import { createEffect, createMemo, createRoot, createSignal, html, onCleanup } from '../index.js'

describe('ui solid primitives', () => {
  it('exports the restricted Solid surface games may use', () => {
    const [value, setValue] = createSignal(1)
    let cleaned = false
    createRoot((dispose) => {
      const doubled = createMemo(() => value() * 2)
      expect(doubled()).toBe(2)
      setValue(2)
      expect(doubled()).toBe(4)
      onCleanup(() => {
        cleaned = true
      })
      dispose()
    })
    expect(cleaned).toBe(true)
    expect(typeof createEffect).toBe('function')
    expect(html`<span>${() => value()}</span>`).toBeTruthy()
  })
})
