import { LuneGoError, type WorldSnapshot } from '@lunego/core'
import { isRecord } from './guards.js'
import {
  assertId,
  assertProfileSnapshot,
  corruptInfo,
  normalizeRecord,
  serializeRecord,
  slotInfo,
  type SelectedDocument,
  type SlotRead,
  type StoredProfile,
} from './profile-schema.js'
import { exportAccountBundle, importAccountBundle } from './profile-transfer.js'

/**
 * Storage port for profile documents. The host ships adapters for browser
 * storage; games and tools may inject any key/value implementation.
 */
export interface ProfileStorage {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
  keys(): readonly string[]
}

export interface ProfileStoreOptions {
  readonly storage: ProfileStorage
  /** Key namespace prefix; defaults to `lunego.profile`. */
  readonly prefix?: string
}

export interface ProfileLoadOptions {
  readonly tick?: number
  readonly schemaVersion?: number
  readonly contentHash?: string
}

import type {
  ImportProfileOptions,
  ProfileSlotInfo,
} from './profile-types.js'

export type { ImportProfileOptions, ProfileSlotInfo, ProfileSlotStatus } from './profile-types.js'

export interface ProfileBundleSummary {
  readonly accountId: string
  readonly slots: readonly ProfileSlotInfo[]
  readonly selected: string | null
}

const DEFAULT_PREFIX = 'lunego.profile'

/**
 * Accounts own character slots; every slot stores exactly one profile-scoped
 * `WorldSnapshot`. World saves are kept elsewhere and paired with a slot only
 * at load time.
 */
export class ProfileStore {
  private readonly storage: ProfileStorage
  private readonly prefix: string

  constructor(options: ProfileStoreOptions) {
    this.storage = options.storage
    this.prefix = options.prefix ?? DEFAULT_PREFIX
    if (this.prefix.length === 0) {
      throw new LuneGoError('profile_invalid', 'profile store prefix must not be empty')
    }
  }

  list(accountId: string): readonly ProfileSlotInfo[] {
    assertId(accountId, 'accountId')
    const prefix = this.slotPrefix(accountId)
    const result: ProfileSlotInfo[] = []
    for (const key of this.allKeys()) {
      if (!key.startsWith(prefix)) {
        continue
      }
      const encoded = key.slice(prefix.length)
      if (encoded.length === 0 || encoded.includes('/')) {
        continue
      }
      let slot: string
      try {
        slot = decodeURIComponent(encoded)
      } catch {
        continue
      }
      const read = this.readSlot(accountId, slot)
      if (read.status === 'ok') {
        result.push(slotInfo(read.record))
      } else if (read.status === 'corrupt') {
        result.push(corruptInfo(slot, read.error))
      }
    }
    return result.sort((left, right) =>
      left.slot < right.slot ? -1 : left.slot > right.slot ? 1 : 0,
    )
  }

  has(accountId: string, slot: string): boolean {
    assertId(accountId, 'accountId')
    assertId(slot, 'slot')
    return this.readRaw(this.slotKey(accountId, slot)) !== null
  }

  create(accountId: string, slot: string, snapshot: WorldSnapshot): ProfileSlotInfo {
    assertId(accountId, 'accountId')
    assertId(slot, 'slot')
    assertProfileSnapshot(snapshot, `profile ${accountId}/${slot}`)
    const key = this.slotKey(accountId, slot)
    if (this.readRaw(key) !== null) {
      throw new LuneGoError('profile_exists', `profile slot ${accountId}/${slot} already exists`)
    }
    const record: StoredProfile = {
      formatVersion: 1,
      accountId,
      slot,
      revision: 1,
      scope: 'profile',
      tick: snapshot.tick,
      schemaVersion: snapshot.schemaVersion,
      contentHash: snapshot.contentHash,
      snapshot,
    }
    this.writeRaw(key, serializeRecord(record, accountId, slot))
    return slotInfo(record)
  }

  save(accountId: string, slot: string, snapshot: WorldSnapshot): ProfileSlotInfo {
    assertId(accountId, 'accountId')
    assertId(slot, 'slot')
    assertProfileSnapshot(snapshot, `profile ${accountId}/${slot}`)
    const read = this.readSlot(accountId, slot)
    if (read.status === 'missing') {
      throw new LuneGoError('profile_missing', `profile slot ${accountId}/${slot} does not exist`)
    }
    if (read.status === 'corrupt') {
      throw new LuneGoError(
        'profile_corrupt',
        `profile slot ${accountId}/${slot} is corrupt: ${read.error}`,
      )
    }
    const record: StoredProfile = {
      formatVersion: 1,
      accountId,
      slot,
      revision: read.record.revision + 1,
      scope: 'profile',
      tick: snapshot.tick,
      schemaVersion: snapshot.schemaVersion,
      contentHash: snapshot.contentHash,
      snapshot,
    }
    this.writeRaw(this.slotKey(accountId, slot), serializeRecord(record, accountId, slot))
    return slotInfo(record)
  }

  load(accountId: string, slot: string, options: ProfileLoadOptions = {}): WorldSnapshot {
    assertId(accountId, 'accountId')
    assertId(slot, 'slot')
    const read = this.readSlot(accountId, slot)
    if (read.status === 'missing') {
      throw new LuneGoError('profile_missing', `profile slot ${accountId}/${slot} does not exist`)
    }
    if (read.status === 'corrupt') {
      throw new LuneGoError(
        'profile_corrupt',
        `profile slot ${accountId}/${slot} is corrupt: ${read.error}`,
      )
    }
    const record = read.record
    if (options.tick !== undefined && options.tick !== record.tick) {
      throw new LuneGoError(
        'profile_mismatch',
        `profile tick ${record.tick} does not match expected ${options.tick}`,
        { rule: 'LG010' },
      )
    }
    if (options.schemaVersion !== undefined && options.schemaVersion !== record.schemaVersion) {
      throw new LuneGoError(
        'profile_mismatch',
        `profile schema ${record.schemaVersion} does not match expected ${options.schemaVersion}`,
        { rule: 'LG010' },
      )
    }
    if (options.contentHash !== undefined && options.contentHash !== record.contentHash) {
      throw new LuneGoError(
        'profile_mismatch',
        'profile content hash does not match the current content pack',
        { rule: 'LG010' },
      )
    }
    return record.snapshot
  }

  select(accountId: string, slot: string): ProfileSlotInfo {
    assertId(accountId, 'accountId')
    assertId(slot, 'slot')
    const read = this.readSlot(accountId, slot)
    if (read.status === 'missing') {
      throw new LuneGoError('profile_missing', `profile slot ${accountId}/${slot} does not exist`)
    }
    if (read.status === 'corrupt') {
      throw new LuneGoError(
        'profile_corrupt',
        `profile slot ${accountId}/${slot} is corrupt: ${read.error}`,
      )
    }
    const document: SelectedDocument = { version: 1, slot }
    this.writeRaw(this.selectedKey(accountId), JSON.stringify(document))
    return slotInfo(read.record)
  }

  selected(accountId: string): string | null {
    assertId(accountId, 'accountId')
    const slot = this.readSelectedSlot(accountId)
    if (slot === null) {
      return null
    }
    return this.readRaw(this.slotKey(accountId, slot)) === null ? null : slot
  }

  delete(accountId: string, slot: string): boolean {
    assertId(accountId, 'accountId')
    assertId(slot, 'slot')
    const key = this.slotKey(accountId, slot)
    if (this.readRaw(key) === null) {
      return false
    }
    this.removeRaw(key)
    if (this.readSelectedSlot(accountId) === slot) {
      this.removeRaw(this.selectedKey(accountId))
    }
    return true
  }

  summary(accountId: string): ProfileBundleSummary {
    return {
      accountId,
      slots: this.list(accountId),
      selected: this.selected(accountId),
    }
  }

  exportAccount(accountId: string): string {
    assertId(accountId, 'accountId')
    return exportAccountBundle(this, accountId)
  }

  importAccount(
    serialized: string,
    options: ImportProfileOptions = {},
  ): readonly ProfileSlotInfo[] {
    return importAccountBundle(this, serialized, options)
  }

  private slotPrefix(accountId: string): string {
    return `${this.accountRoot(accountId)}/slots/`
  }

  private accountRoot(accountId: string): string {
    return `${this.prefix}/accounts/${encodeURIComponent(accountId)}`
  }

  private slotKey(accountId: string, slot: string): string {
    return `${this.slotPrefix(accountId)}${encodeURIComponent(slot)}`
  }

  private selectedKey(accountId: string): string {
    return `${this.accountRoot(accountId)}/selected`
  }

  private readSelectedSlot(accountId: string): string | null {
    const raw = this.readRaw(this.selectedKey(accountId))
    if (raw === null) {
      return null
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed) || parsed['version'] !== 1) {
        return null
      }
      const slot = parsed['slot']
      return typeof slot === 'string' && slot.length > 0 ? slot : null
    } catch {
      return null
    }
  }

  private readSlot(accountId: string, slot: string): SlotRead {
    const raw = this.readRaw(this.slotKey(accountId, slot))
    if (raw === null) {
      return { status: 'missing' }
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      return { status: 'ok', record: normalizeRecord(parsed, accountId, slot) }
    } catch (error) {
      return {
        status: 'corrupt',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private allKeys(): readonly string[] {
    try {
      return this.storage.keys()
    } catch (error) {
      throw new LuneGoError('profile_storage', 'failed to enumerate profile storage keys', {
        cause: error,
      })
    }
  }

  private readRaw(key: string): string | null {
    try {
      return this.storage.read(key)
    } catch (error) {
      throw new LuneGoError('profile_storage', `failed to read profile document ${key}`, {
        cause: error,
      })
    }
  }

  private writeRaw(key: string, value: string): void {
    try {
      this.storage.write(key, value)
    } catch (error) {
      throw new LuneGoError('profile_storage', `failed to write profile document ${key}`, {
        cause: error,
      })
    }
  }

  private removeRaw(key: string): void {
    try {
      this.storage.remove(key)
    } catch (error) {
      throw new LuneGoError('profile_storage', `failed to remove profile document ${key}`, {
        cause: error,
      })
    }
  }
}

/** In-memory storage port, useful for tests, tools and worker hand-off. */
export function createMemoryProfileStorage(
  initial: Readonly<Record<string, string>> = {},
): ProfileStorage {
  const values = new Map<string, string>(Object.entries(initial))
  return {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => {
      values.set(key, value)
    },
    remove: (key) => {
      values.delete(key)
    },
    keys: () => [...values.keys()],
  }
}
