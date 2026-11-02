import { describe, expect, it } from 'vitest'
import { CameraController, followCamera } from '../camera.js'

describe('camera follow', () => {
  it('centers the target at zoom 1 and 2 with pixel snapping', () => {
    const camera = new CameraController({ width: 480, height: 270 })
    expect(camera.follow({ x: 240, y: 135 })).toEqual({ x: 0, y: 0 })
    camera.setZoom(2)
    expect(camera.follow({ x: 240, y: 135 })).toEqual({ x: 120, y: 67.5 })
    expect(camera.camera).toEqual({ x: 120, y: 67.5 })
  })

  it('clamps to world bounds and handles worlds smaller than the view', () => {
    const camera = new CameraController({
      width: 480,
      height: 270,
      bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 },
    })
    expect(camera.follow({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(camera.follow({ x: 1000, y: 600 })).toEqual({ x: 520, y: 330 })
    expect(followCamera({ x: 500, y: 300 }, {
      width: 480,
      height: 270,
      bounds: { minX: 0, minY: 0, maxX: 400, maxY: 200 },
    })).toEqual({ x: 0, y: 0 })
  })

  it('validates dimensions and zoom', () => {
    expect(() => new CameraController({ width: 0, height: 270 })).toThrow(/width/)
    const camera = new CameraController({ width: 480, height: 270 })
    expect(() => camera.setZoom(0)).toThrow(/zoom/)
  })
})
