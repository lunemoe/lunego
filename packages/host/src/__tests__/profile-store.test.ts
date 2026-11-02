import { describe, expect, it } from 'vitest'
import {
  World,
  defineComponent,
  defineFeature,
  t,
  type WorldSnapshot,
} from '@lunego/core'
import {
  ProfileStore,
  createMemoryProfileStorage,
  type ProfileStorage,
} from '../index.js'

const Level = defineComponent(
  'ProfileSlotLevel',
  { level: t.i32 },
  { persist: 'profile' },
)
const WorldMarker = defineComponent(
  'ProfileSlotWorldMarker',
  { n: t.i32 },
  { persist: 'world' },
)
const feature = defineFeature({
  name: 'profile-store-fixture',
  schema: { components: [Level, WorldMarker] },
})

function profileSnapshot(level: number, tick = 0): WorldSnapshot {
  const world = new World({ features: [feature], dt: 0.1 })
  world.spawn({
    ProfileSlotLevel: { level },
    ProfileSlotWorldMarker: { n: level * 10 },
  })
  for (let index = 0; index < tick; index += 1) {
    world.step()
  }
  return world.snapshot('profile')
}

function slotKey(
  storage: ProfileStorage,
  accountId: string,
  slot: string,
): string {
  const key = storage
    .keys()
    .find((candidate) =>
      candidate.includes(
        `/accounts/${encodeURIComponent(accountId)}/slots/${encodeURIComponent(slot)}`,
      ),
    )
  if (key === undefined) {
    throw new Error(`missing storage key for ${accountId}/${slot}`)
  }
  return key
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action()
    throw new Error(`expected ${code}`)
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

describe('ProfileStore', () => {
  it('creates, lists and saves character slots independently', () => {
    const storage = createMemoryProfileStorage()
    const store = new ProfileStore({ storage })
    const alpha = profileSnapshot(1, 2)
    const beta = profileSnapshot(9, 3)

    const created = store.create('acc', 'alpha', alpha)
    expect(created).toMatchObject({
      slot: 'alpha',
      status: 'ok',
      revision: 1,
      tick: 2,
      schemaVersion: 1,
      contentHash: alpha.contentHash,
      error: null,
    })
    store.create('acc', 'beta', beta)
    expect(store.list('acc').map((entry) => entry.slot)).toEqual(['alpha', 'beta'])
    expect(store.has('acc', 'alpha')).toBe(true)

    const updated = profileSnapshot(5, 4)
    expect(store.save('acc', 'alpha', updated).revision).toBe(2)
    expect(store.load('acc', 'alpha')).toEqual(updated)
    expect(store.load('acc', 'beta')).toEqual(beta)
    expect(store.load('acc', 'alpha').tick).toBe(4)

    expectCode(() => store.create('acc', 'alpha', alpha), 'profile_exists')
    expectCode(
      () => store.create('acc', 'gamma', { ...alpha, scope: 'world' } as WorldSnapshot),
      'profile_scope',
    )
    expectCode(() => store.save('acc', 'missing', alpha), 'profile_missing')
  })

  it('selects slots, deletes them and clears a deleted selection', () => {
    const storage = createMemoryProfileStorage()
    const store = new ProfileStore({ storage })
    const alpha = profileSnapshot(1, 1)
    store.create('acc', 'alpha', alpha)
    store.create('acc', 'beta', profileSnapshot(2, 1))

    store.select('acc', 'alpha')
    expect(store.selected('acc')).toBe('alpha')
    expect(new ProfileStore({ storage }).selected('acc')).toBe('alpha')
    expect(store.summary('acc')).toMatchObject({
      accountId: 'acc',
      selected: 'alpha',
    })
    expectCode(() => store.select('acc', 'missing'), 'profile_missing')

    expect(store.delete('acc', 'alpha')).toBe(true)
    expect(store.selected('acc')).toBeNull()
    expect(store.list('acc').map((entry) => entry.slot)).toEqual(['beta'])
    expect(store.delete('acc', 'alpha')).toBe(false)
  })

  it('distinguishes empty, valid and corrupt slots', () => {
    const storage = createMemoryProfileStorage()
    const store = new ProfileStore({ storage })
    expect(store.list('empty')).toEqual([])
    expectCode(() => store.load('empty', 'alpha'), 'profile_missing')

    const alpha = profileSnapshot(1, 2)
    store.create('acc', 'alpha', alpha)
    store.create('acc', 'beta', profileSnapshot(2, 2))
    storage.write(slotKey(storage, 'acc', 'alpha'), '{broken')

    expect(store.list('acc')).toEqual([
      expect.objectContaining({ slot: 'alpha', status: 'corrupt', error: expect.any(String) }),
      expect.objectContaining({ slot: 'beta', status: 'ok' }),
    ])
    expectCode(() => store.load('acc', 'alpha'), 'profile_corrupt')
    expectCode(() => store.exportAccount('acc'), 'profile_corrupt')
    expect(store.load('acc', 'beta').tick).toBe(2)

    expect(store.delete('acc', 'alpha')).toBe(true)
    expect(store.list('acc').map((entry) => entry.slot)).toEqual(['beta'])
    store.create('acc', 'alpha', alpha)
    expect(store.load('acc', 'alpha')).toEqual(alpha)
  })

  it('rejects snapshots whose stored metadata disagrees with the payload', () => {
    const storage = createMemoryProfileStorage()
    const store = new ProfileStore({ storage })
    const alpha = profileSnapshot(4, 6)
    store.create('acc', 'alpha', alpha)
    const key = slotKey(storage, 'acc', 'alpha')
    const raw = JSON.parse(storage.read(key) ?? '{}') as Record<string, unknown>
    storage.write(key, JSON.stringify({ ...raw, tick: 99 }))

    expect(store.list('acc')[0]).toMatchObject({ slot: 'alpha', status: 'corrupt' })
    expectCode(() => store.load('acc', 'alpha'), 'profile_corrupt')
  })

  it('validates expected tick, schema version and content hash', () => {
    const storage = createMemoryProfileStorage()
    const store = new ProfileStore({ storage })
    const alpha = profileSnapshot(3, 7)
    store.create('acc', 'alpha', alpha)

    expect(store.load('acc', 'alpha', { tick: 7, schemaVersion: 1, contentHash: alpha.contentHash }))
      .toEqual(alpha)
    expectCode(() => store.load('acc', 'alpha', { tick: 8 }), 'profile_mismatch')
    expectCode(() => store.load('acc', 'alpha', { schemaVersion: 2 }), 'profile_mismatch')
    expectCode(() => store.load('acc', 'alpha', { contentHash: 'other' }), 'profile_mismatch')
  })

  it('exports and imports account bundles with conflict handling', () => {
    const sourceStorage = createMemoryProfileStorage()
    const source = new ProfileStore({ storage: sourceStorage })
    const alpha = profileSnapshot(1, 2)
    const beta = profileSnapshot(2, 3)
    source.create('acc', 'alpha', alpha)
    source.create('acc', 'beta', beta)
    source.select('acc', 'beta')

    const bundle = source.exportAccount('acc')
    const targetStorage = createMemoryProfileStorage()
    const target = new ProfileStore({ storage: targetStorage })
    const imported = target.importAccount(bundle, { accountId: 'copied' })
    expect(imported.map((entry) => entry.slot)).toEqual(['alpha', 'beta'])
    expect(target.load('copied', 'alpha')).toEqual(alpha)
    expect(target.load('copied', 'beta')).toEqual(beta)
    expect(target.selected('copied')).toBe('beta')

    expectCode(() => target.importAccount(bundle, { accountId: 'copied' }), 'profile_exists')
    target.save('copied', 'alpha', profileSnapshot(8, 9))
    target.importAccount(bundle, { accountId: 'copied', overwrite: true })
    expect(target.load('copied', 'alpha')).toEqual(alpha)
    expect(target.list('copied').every((entry) => entry.status === 'ok')).toBe(true)

    expectCode(() => target.importAccount('{bad'), 'profile_import_invalid')
    expectCode(() => target.importAccount('{}'), 'profile_import_invalid')
    // The exported bundle is JSON by contract; mutate one slot to a world scope.
    const invalidBundle = JSON.parse(bundle) as {
      slots: Array<Record<string, unknown>>
    }
    const firstSlot = invalidBundle.slots[0]
    const firstSnapshot = firstSlot?.['snapshot']
    if (
      firstSlot !== undefined &&
      typeof firstSnapshot === 'object' &&
      firstSnapshot !== null &&
      !Array.isArray(firstSnapshot)
    ) {
      firstSlot['snapshot'] = { ...firstSnapshot, scope: 'world' }
    }
    expectCode(
      () => target.importAccount(JSON.stringify(invalidBundle), { accountId: 'other' }),
      'profile_import_invalid',
    )
  })

  it('keeps the previous slot when a storage write fails', () => {
    const base = createMemoryProfileStorage()
    let failWrites = false
    const storage: ProfileStorage = {
      read: (key) => base.read(key),
      write: (key, value) => {
        if (failWrites) {
          throw new Error('quota exceeded')
        }
        base.write(key, value)
      },
      remove: (key) => base.remove(key),
      keys: () => base.keys(),
    }
    const store = new ProfileStore({ storage })
    const first = profileSnapshot(1, 1)
    store.create('acc', 'alpha', first)
    failWrites = true
    expectCode(() => store.save('acc', 'alpha', profileSnapshot(2, 2)), 'profile_storage')
    expect(store.load('acc', 'alpha')).toEqual(first)
    expect(store.list('acc')[0]?.revision).toBe(1)
  })
})
