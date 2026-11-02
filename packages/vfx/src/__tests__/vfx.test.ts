import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Effects, PIXELFX_SOURCE } from '../catalog.js'
import {
  DEFAULT_PROJECTION,
  anchorFor,
  angleFromFacing,
  effectLayerTransform,
  effectScreenPosition,
  projectGround,
} from '../projection.js'
import { VfxSystem, defineCueMap } from '../system.js'
import type { CueInstance, Frame } from '@lunego/core'
import type { EffectModule, PixelFrame } from '../types.js'

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


const probeEffect: EffectModule = {
  meta: { name: 'Probe', size: [1, 1], origin: [0, 0], duration: 1 },
  create: () => ({
    draw(painter) {
      ;(painter as { px(x: number, y: number, color: number): void }).px(0, 0, 0xffffffff)
    },
  }),
}

function hasPixel(frame: PixelFrame, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < frame.w && y < frame.h && frame.color[y * frame.w + x] !== 0
}

function probeSystem(): VfxSystem {
  return new VfxSystem({ width: 64, height: 64 })
}

describe('world to screen contract', () => {
  it('uses the render-pixi camera rounding at every zoom', () => {
    expect(effectScreenPosition(20, 20, 3.4, 2.6, 1)).toEqual({ x: 17, y: 17 })
    expect(effectScreenPosition(20, 20, 3.4, 2.6, 2)).toEqual({ x: 33, y: 35 })
    expect(effectScreenPosition(20, 20, 3.4, 2.6, 3)).toEqual({ x: 50, y: 52 })
    expect(effectLayerTransform(10.4, 20.6, 2, 480, 270)).toEqual({
      x: 10.5,
      y: 20.5,
      width: 240,
      height: 135,
    })
  })

  it('draws a one-pixel effect at the formula position for zoom 1 and 2', () => {
    const vfx = probeSystem()
    vfx.play({ effect: probeEffect, x: 20, y: 20 })
    const one = vfx.compose('front', 3.4, 2.6, 1)
    expect(hasPixel(one, 17, 17)).toBe(true)
    const two = vfx.compose('front', 3.4, 2.6, 2)
    const expected = effectScreenPosition(20, 20, 3.4, 2.6, 2)
    expect(hasPixel(two, expected.x, expected.y)).toBe(true)
  })

  it('applies request offsets before ground projection and keeps ground/front anchors', () => {
    const front = probeSystem()
    front.play({ effect: probeEffect, x: 20, y: 20, offsetX: 3, offsetY: -4 })
    expect(hasPixel(front.compose('front'), 23, 16)).toBe(true)

    const ground = probeSystem()
    ground.play({ effect: probeEffect, x: 20, y: 20, offsetX: 3, offsetY: -4, layer: 'ground' })
    const projected = projectGround(3, -4, DEFAULT_PROJECTION)
    expect(hasPixel(ground.compose('ground'), 20 + Math.floor(projected.x), 20 + Math.floor(projected.y))).toBe(true)

    const anchored = probeSystem()
    anchored.play({ effect: probeEffect, x: 20, y: 20, layer: 'ground' })
    expect(hasPixel(anchored.compose('ground'), 20, 20)).toBe(true)
    const frontAnchored = probeSystem()
    frontAnchored.play({ effect: probeEffect, x: 20, y: 20 })
    expect(hasPixel(frontAnchored.compose('front'), 20, 20)).toBe(true)
  })

  it('supports anchor center as a frame-center offset', () => {
    const centered: EffectModule = {
      ...probeEffect,
      meta: { ...probeEffect.meta, size: [4, 4] },
    }
    const vfx = probeSystem()
    vfx.play({ effect: centered, x: 20, y: 20, anchor: 'center' })
    expect(hasPixel(vfx.compose('front'), 22, 22)).toBe(true)
  })

  it('accepts a rewound frame tick after loading an older snapshot', () => {
    const vfx = probeSystem()
    const map = defineCueMap({
      probe: () => [{ effect: probeEffect, x: 10, y: 10 }],
    })
    vfx.consume({ ...frameWith(cue('10:test:0', 'probe', {})), tick: 10 }, map)
    expect(vfx.effectCount).toBe(1)
    vfx.consume({ ...frameWith(cue('3:test:0', 'probe', {})), tick: 3 }, map)
    expect(vfx.effectCount).toBe(2)
  })
})
