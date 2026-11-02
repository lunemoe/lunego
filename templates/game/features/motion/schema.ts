import { defineCommand, defineComponent, defineCue, defineModel, defineTag, t } from '@lunego/core'

export const Position = defineComponent(
  'Position',
  { x: t.f32, y: t.f32 },
  { persist: 'world', interpolate: true },
)

export const Velocity = defineComponent(
  'Velocity',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)

export const Player = defineTag('Player', { persist: 'world' })

export const Renderable = defineComponent(
  'Renderable',
  { width: t.f32, height: t.f32, color: t.u32, texture: t.optional(t.asset('sprite')) },
  { persist: 'world' },
)

export const Vitals = defineModel(
  'Vitals',
  { hp: t.u16, maxHp: t.u16 },
  { hp: 100, maxHp: 100 },
  { persist: 'world' },
)

export const Start = defineCommand('motion.start', {})
export const MoveIntent = defineCommand('motion.moveIntent', { x: t.f32, y: t.f32 })
export const MoveDust = defineCue('motion.moveDust', { at: t.vec2 })
