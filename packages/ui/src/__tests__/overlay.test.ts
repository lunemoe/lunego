import { beforeEach, describe, expect, it } from 'vitest'
import { EffectOverlay, type OverlayViewport } from '../index.js'

const viewport: OverlayViewport = {
  cssScale: 2,
  offsetX: 10,
  offsetY: 20,
  worldToScreen: (x, y) => ({ x, y }),
}

beforeEach(() => {
  document.body.innerHTML = '<div id="fx"></div>'
})

describe('effect overlay', () => {
  it('positions floating text through the viewport and expires by elapsed time', () => {
    const overlay = new EffectOverlay('#fx')
    const label = overlay.floatingText({ x: 5, y: 6, text: '12' }, viewport)
    expect(label.style.left).toBe('20px')
    expect(label.style.top).toBe('32px')
    expect(label.textContent).toBe('12')
    overlay.update(0.2)
    expect(overlay.nodeCount).toBe(1)
    overlay.update(1)
    expect(overlay.nodeCount).toBe(0)
    expect(label.isConnected).toBe(false)
  })

  it('interpolates projectiles and updates flash/shake lifecycle', () => {
    const overlay = new EffectOverlay('#fx')
    const projectile = overlay.projectile(
      {
        texture: '/p.png',
        from: { x: 0, y: 0 },
        to: { x: 10, y: 0 },
        durationSeconds: 1,
        width: 4,
        height: 4,
      },
      viewport,
    )
    overlay.update(0.5)
    expect(projectile.style.left).toBe('20px')
    const target = document.createElement('div')
    document.body.appendChild(target)
    const flash = overlay.flash('#fff', 0.2)
    overlay.shake(target, 0.2)
    expect(target.classList.contains('lg-fx-shake')).toBe(true)
    overlay.update(0.7)
    expect(flash.style.opacity).toBe('0')
    expect(target.classList.contains('lg-fx-shake')).toBe(false)
    overlay.update(1.1)
    expect(overlay.nodeCount).toBe(0)
  })

  it('skips shake/flash when reduced motion is enabled', () => {
    const overlay = new EffectOverlay('#fx', { reduceMotion: true })
    const target = document.createElement('div')
    document.body.appendChild(target)
    const flash = overlay.flash('#fff', 1)
    overlay.shake(target, 1)
    expect(target.classList.contains('lg-fx-shake')).toBe(false)
    expect(overlay.nodeCount).toBe(0)
    expect(flash.isConnected).toBe(false)
    overlay.setReducedMotion(false)
    overlay.shake(target, 1)
    expect(target.classList.contains('lg-fx-shake')).toBe(true)
  })

  it('caps nodes and destroys cleanly', () => {
    const overlay = new EffectOverlay('#fx', { maxNodes: 2 })
    overlay.floatingText({ x: 0, y: 0, text: 'a' }, viewport)
    overlay.floatingText({ x: 0, y: 0, text: 'b' }, viewport)
    overlay.floatingText({ x: 0, y: 0, text: 'c' }, viewport)
    expect(overlay.nodeCount).toBe(2)
    overlay.destroy()
    expect(overlay.nodeCount).toBe(0)
    expect(document.querySelector('#fx')?.childElementCount).toBe(0)
    expect(() => new EffectOverlay('#missing')).toThrow(/not found/)
  })
})
