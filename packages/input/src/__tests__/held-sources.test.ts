import { expect, it } from 'vitest'
import { InputActions } from '../index.js'

it('keeps an action held until every bound key and external source releases it', () => {
  const actions = new InputActions({ right: ['KeyD', 'ArrowRight'] })
  actions.handleKeyDown('KeyD')
  actions.handleKeyDown('ArrowRight')
  actions.endFrame()
  actions.handleKeyUp('KeyD')
  expect(actions.isDown('right')).toBe(true)
  expect(actions.wasReleased('right')).toBe(false)
  actions.setAction('right', false)
  expect(actions.isDown('right')).toBe(true)
  actions.setAction('right', true)
  actions.handleKeyUp('ArrowRight')
  expect(actions.isDown('right')).toBe(true)
  actions.setAction('right', false)
  expect(actions.isDown('right')).toBe(false)
  expect(actions.wasReleased('right')).toBe(true)
})

it('clears all device sources on focus loss', () => {
  const actions = new InputActions({ right: ['KeyD'] })
  actions.handleKeyDown('KeyD')
  actions.setAction('right', true)
  actions.releaseAll()
  actions.setAction('right', false)
  expect(actions.isDown('right')).toBe(false)
  actions.handleKeyDown('KeyD')
  expect(actions.wasPressed('right')).toBe(true)
})
