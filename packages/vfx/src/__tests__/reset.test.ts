import { expect, it } from 'vitest'
import { VfxSystem } from '../system.js'
import { Effects } from '../catalog.js'

it('clears transient effects without destroying the system so a restored run can play again', () => {
  const vfx = new VfxSystem({ width: 480, height: 270 })
  const effect = { effect: Effects.impactSpark, x: 10, y: 20, seed: 7 }
  vfx.play(effect)
  expect(vfx.effectCount).toBe(1)
  vfx.clear()
  expect(vfx.effectCount).toBe(0)
  vfx.play(effect)
  vfx.update(0.016)
  expect(vfx.effectCount).toBe(1)
})
