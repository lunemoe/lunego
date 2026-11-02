import { describe, expect, it } from 'vitest'
import { viewportTransform } from '../viewport.js'

describe('viewport transform', () => {
  it('combines CSS scale, zoom and the renderer-rounded camera', () => {
    const viewport = viewportTransform({
      cssWidth: 960,
      virtualWidth: 480,
      offsetX: 10,
      offsetY: 20,
      cameraX: 100.3,
      cameraY: 50.2,
      zoom: 2,
    })
    expect(viewport).toMatchObject({
      scale: 4,
      cssScale: 2,
      zoom: 2,
      offsetX: 10,
      offsetY: 20,
      cameraX: 100.5,
      cameraY: 50,
      camera: { x: 100.5, y: 50 },
    })
    expect(viewport.worldToScreen(190, 105)).toEqual({ x: 179, y: 110 })
    expect(viewport.screenToWorld(179, 110)).toEqual({ x: 190, y: 105 })
  })

  it('rejects invalid zoom and width', () => {
    expect(() =>
      viewportTransform({ cssWidth: 480, virtualWidth: 480, offsetX: 0, offsetY: 0, cameraX: 0, cameraY: 0, zoom: 0 }),
    ).toThrow(/zoom/)
    expect(() =>
      viewportTransform({ cssWidth: 0, virtualWidth: 480, offsetX: 0, offsetY: 0, cameraX: 0, cameraY: 0, zoom: 1 }),
    ).toThrow(/cssWidth/)
  })
})
