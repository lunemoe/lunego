import { describe, expect, it } from 'vitest'
import { viewportTransform } from '../viewport.js'

describe('viewport transform', () => {
  it('combines CSS scale, zoom and the renderer-rounded camera', () => {
    expect(
      viewportTransform({
        cssWidth: 960,
        virtualWidth: 480,
        offsetX: 10,
        offsetY: 20,
        cameraX: 100.3,
        cameraY: 50.2,
        zoom: 2,
      }),
    ).toEqual({
      scale: 4,
      offsetX: 10,
      offsetY: 20,
      cameraX: 100.5,
      cameraY: 50,
    })
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
