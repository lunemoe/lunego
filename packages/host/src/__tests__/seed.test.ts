import { expect, it } from 'vitest'
import { createGame } from '../index.js'

it('passes the configured seed into the world rather than silently using the default', () => {
  const first = createGame({ features: [], seed: 7 })
  const second = createGame({ features: [], seed: 8 })
  expect(first.save().rng.seed).toBe(7)
  expect(second.save().rng.seed).toBe(8)
})
