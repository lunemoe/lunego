import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Effects, PIXELFX_SOURCE } from '../catalog.js'
import {
  DEFAULT_PROJECTION,
  anchorFor,
  angleFromFacing,
  projectGround,
} from '../projection.js'
import { VfxSystem, defineCueMap } from '../system.js'
import type { CueInstance, Frame } from '@lunego/core'
import type { PixelFrame } from '../types.js'

function system(maxEffects?: number): VfxSystem {
  return new VfxSystem({ width: 480, height: 270, maxEffects })
}

function cue(id: string, type: string, payload: unknown): CueInstance {
  return { id, type, tick: 1, sequence: 0, source: 'test', payload }
}

function frameWith(...cues: CueInstance[]): Frame {
  return { tick: 1, events: [], cues, modelPatches: [] }
}

function pixels(frame: PixelFrame): string {
  return `${Array.from(frame.color).join(',')}|${Array.from(frame.light).join(',')}`
}

describe('top-down projection', () => {
  it('squashes and slants the floor plane', () => {
    const projection = { groundScaleY: 0.5, skewX: 0.25, footOffset: 4 }
    expect(projectGround(10, 20, projection)).toEqual({ x: 15, y: 10 })
    expect(anchorFor(100, 50, projection)).toEqual({ x: 100, y: 54 })
    expect(DEFAULT_PROJECTION.groundScaleY).toBeLessThan(1)
  })

  it('derives the effect angle from screen-space facing', () => {
    expect(angleFromFacing(1, 0)).toBeCloseTo(0, 6)
    expect(angleFromFacing(0, 1)).toBeCloseTo(Math.PI / 2, 6)
    expect(angleFromFacing(-1, 0)).toBeCloseTo(Math.PI, 6)
  })
})

describe('catalog', () => {
  it('vendors deterministic effect layers with metadata', () => {
    expect(PIXELFX_SOURCE.license).toBe('MIT')
    expect(Object.keys(Effects).length).toBeGreaterThan(30)
    for (const [name, effect] of Object.entries(Effects)) {
      expect(effect.meta.name.length, name).toBeGreaterThan(0)
      expect(effect.meta.size[0], name).toBeGreaterThan(0)
      expect(effect.meta.size[1], name).toBeGreaterThan(0)
      expect(effect.meta.origin[0], name).toBeGreaterThanOrEqual(0)
    }
  })

  it('does not vendor Math.random into the effect runtime', () => {
    const core = readFileSync(
      new URL('../../vendor/pixelfx/src/core/math.js', import.meta.url),
      'utf8',
    )
    expect(core.includes('Math.random')).toBe(false)
  })
})

describe('vfx system', () => {
  it('starts and retires effects by their authored duration', () => {
    const vfx = system()
    vfx.play({ effect: Effects.poof, x: 100, y: 100 })
    expect(vfx.effectCount).toBe(1)
    vfx.update(Effects.poof.meta.duration + 0.5)
    expect(vfx.effectCount).toBe(0)
  })

  it('caps concurrent effects', () => {
    const vfx = system(2)
    vfx.play({ effect: Effects.impactSpark, x: 10, y: 10 })
    vfx.play({ effect: Effects.impactSpark, x: 20, y: 20 })
    vfx.play({ effect: Effects.impactSpark, x: 30, y: 30 })
    expect(vfx.effectCount).toBe(2)
  })

  it('composes pixel-identical frames for identical seeded requests', () => {
    const left = system()
    const right = system()
    const request = {
      effect: Effects.impactSpark,
      x: 240,
      y: 180,
      seed: 42,
      angle: 0.4,
    } as const
    left.play(request)
    right.play(request)
    left.update(0.08)
    right.update(0.08)
    expect(pixels(left.compose('front'))).toBe(pixels(right.compose('front')))
    expect(left.compose('front').color.some((value) => value !== 0)).toBe(true)
  })

  it('maps replicated cues to effects and derives seeds from cue ids', () => {
    const map = defineCueMap({
      'test.spark': (entry) => [
        {
          effect: Effects.impactSpark,
          x: (entry.payload as { x: number }).x,
          y: (entry.payload as { y: number }).y,
        },
      ],
    })
    const left = system()
    const right = system()
    const cues = [cue('1:demo:0', 'test.spark', { x: 90, y: 100 })]
    left.consume(frameWith(...cues), map)
    right.consume(frameWith(...cues), map)
    expect(left.effectCount).toBe(1)
    left.update(0.1)
    right.update(0.1)
    expect(pixels(left.compose('front'))).toBe(pixels(right.compose('front')))
  })

  it('projects ground effects with a smaller vertical extent', () => {
    const ground = system()
    ground.play({ effect: Effects.dirtBurst, x: 240, y: 180, layer: 'ground', seed: 3 })
    ground.update(0.2)
    const front = system()
    front.play({ effect: Effects.dirtBurst, x: 240, y: 180, layer: 'front', seed: 3 })
    front.update(0.2)
    const extent = (frame: PixelFrame): number => {
      let min = frame.h
      let max = -1
      for (let y = 0; y < frame.h; y += 1) {
        for (let x = 0; x < frame.w; x += 1) {
          if (frame.color[y * frame.w + x] !== 0) {
            min = Math.min(min, y)
            max = Math.max(max, y)
          }
        }
      }
      return max - min
    }
    const groundExtent = extent(ground.compose('ground'))
    const frontExtent = extent(front.compose('front'))
    expect(groundExtent).toBeGreaterThan(0)
    expect(groundExtent).toBeLessThan(frontExtent)
  })

  it('releases resources on destroy', () => {
    const vfx = system()
    vfx.play({ effect: Effects.poof, x: 10, y: 10 })
    vfx.destroy()
    expect(vfx.effectCount).toBe(0)
    expect(vfx.isDestroyed).toBe(true)
    expect(() => vfx.play({ effect: Effects.poof, x: 0, y: 0 })).toThrow(/destroyed/)
  })
})
