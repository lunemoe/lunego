import { expect, it } from 'vitest'
import { BrowserSaveError, createBrowserGameSaveStore, createGame } from '../index.js'

it('stores world and profile together, preserves the previous pair on a failed write and recovers corrupt JSON', () => {
  const values = new Map<string, string>()
  let fail = false
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const game = createGame({ features: [], seed: 7 })
  const store = createBrowserGameSaveStore('pair', storage)
  expect(store.load()).toBeNull()
  const initial = game.saveGame()
  store.save(initial)
  expect(store.load()).toEqual(initial)
  game.step(2)
  fail = true
  expect(() => store.save(game.saveGame())).toThrow(BrowserSaveError)
  expect(store.load()).toEqual(initial)
  fail = false
  values.set('pair', '{corrupt')
  expect(store.load()).toEqual(initial)
  store.clear()
  expect(store.load()).toBeNull()
})

it('rejects mismatched world/profile pairs before replacing the save', () => {
  const values = new Map<string, string>()
  const store = createBrowserGameSaveStore('pair', {
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) },
  })
  const game = createGame({ features: [], seed: 7 })
  const first = game.saveGame()
  store.save(first)
  game.step()
  expect(() => store.save({ world: first.world, profile: game.saveGame().profile })).toThrow(/same tick/)
  expect(store.load()).toEqual(first)
})
