import { LuneGoError, type WorldSnapshot } from '@lunego/core'
import {
  assertProfileSnapshot,
  createBundle,
  normalizeRecord,
  parseBundle,
  type StoredProfile,
} from './profile-schema.js'
import type {
  ImportProfileOptions,
  ProfileSlotInfo,
} from './profile-types.js'

/** The subset of ProfileStore needed by account export/import. */
export interface ProfileStorePort {
  list(accountId: string): readonly ProfileSlotInfo[]
  has(accountId: string, slot: string): boolean
  load(accountId: string, slot: string): WorldSnapshot
  create(accountId: string, slot: string, snapshot: WorldSnapshot): ProfileSlotInfo
  save(accountId: string, slot: string, snapshot: WorldSnapshot): ProfileSlotInfo
  select(accountId: string, slot: string): ProfileSlotInfo
  selected(accountId: string): string | null
  delete(accountId: string, slot: string): boolean
}

function recordFor(
  accountId: string,
  info: ProfileSlotInfo,
  snapshot: WorldSnapshot,
): StoredProfile {
  assertProfileSnapshot(snapshot, `profile ${accountId}/${info.slot}`)
  return {
    formatVersion: 1,
    accountId,
    slot: info.slot,
    revision: info.revision,
    scope: 'profile',
    tick: snapshot.tick,
    schemaVersion: snapshot.schemaVersion,
    contentHash: snapshot.contentHash,
    snapshot,
  }
}

export function exportAccountBundle(store: ProfileStorePort, accountId: string): string {
  const slots: StoredProfile[] = []
  for (const info of store.list(accountId)) {
    if (info.status === 'corrupt') {
      throw new LuneGoError(
        'profile_corrupt',
        `profile slot ${accountId}/${info.slot} is corrupt and cannot be exported: ${info.error ?? ''}`,
      )
    }
    slots.push(recordFor(accountId, info, store.load(accountId, info.slot)))
  }
  return JSON.stringify(createBundle(accountId, store.selected(accountId), slots))
}

export function importAccountBundle(
  store: ProfileStorePort,
  serialized: string,
  options: ImportProfileOptions = {},
): readonly ProfileSlotInfo[] {
  const parsed = parseBundle(serialized)
  const targetAccount = options.accountId ?? parsed.accountId
  if (targetAccount.length === 0) {
    throw new LuneGoError('profile_import_invalid', 'import accountId must not be empty')
  }
  const records = parsed.records.map((record) => {
    const candidate = { ...record, accountId: targetAccount }
    try {
      return normalizeRecord(candidate, targetAccount, record.slot)
    } catch (error) {
      throw new LuneGoError(
        'profile_import_invalid',
        `slot ${record.slot} is invalid: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  })
  const previous = new Map<string, WorldSnapshot | null>()
  for (const record of records) {
    const existing = store.has(targetAccount, record.slot)
    if (existing && options.overwrite !== true) {
      throw new LuneGoError(
        'profile_exists',
        `profile slot ${targetAccount}/${record.slot} already exists`,
      )
    }
    previous.set(record.slot, existing ? store.load(targetAccount, record.slot) : null)
  }
  try {
    for (const record of records) {
      if (previous.get(record.slot) === null) {
        store.create(targetAccount, record.slot, record.snapshot)
      } else {
        store.save(targetAccount, record.slot, record.snapshot)
      }
    }
    if (parsed.selected !== null) {
      store.select(targetAccount, parsed.selected)
    }
  } catch (error) {
    for (const [slot, snapshot] of previous) {
      try {
        if (snapshot === null) {
          store.delete(targetAccount, slot)
        } else if (store.has(targetAccount, slot)) {
          store.save(targetAccount, slot, snapshot)
        } else {
          store.create(targetAccount, slot, snapshot)
        }
      } catch {
        // Keep the original import failure; rollback is best-effort.
      }
    }
    throw error
  }
  return store.list(targetAccount)
}
