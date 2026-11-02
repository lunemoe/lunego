import {
  LuneGoError,
  SNAPSHOT_FORMAT_VERSION,
  type WorldSnapshot,
} from '@lunego/core'
import { isRecord } from './guards.js'
import type { ProfileSlotInfo } from './profile-types.js'

export const RECORD_FORMAT_VERSION = 1
export const BUNDLE_KIND = 'lunego.profile.bundle'

export interface StoredProfile {
  readonly formatVersion: typeof RECORD_FORMAT_VERSION
  readonly accountId: string
  readonly slot: string
  readonly revision: number
  readonly scope: 'profile'
  readonly tick: number
  readonly schemaVersion: number
  readonly contentHash: string
  readonly snapshot: WorldSnapshot
}

export interface ProfileBundle {
  readonly kind: typeof BUNDLE_KIND
  readonly formatVersion: typeof RECORD_FORMAT_VERSION
  readonly accountId: string
  readonly selected: string | null
  readonly slots: readonly StoredProfile[]
}

export interface SelectedDocument {
  readonly version: typeof RECORD_FORMAT_VERSION
  readonly slot: string
}

export type SlotRead =
  | { readonly status: 'missing' }
  | { readonly status: 'ok'; readonly record: StoredProfile }
  | { readonly status: 'corrupt'; readonly error: string }

export function invalid(message: string, cause?: unknown): LuneGoError {
  return new LuneGoError(
    'profile_invalid',
    message,
    cause === undefined ? {} : { cause },
  )
}

function importInvalid(message: string, cause?: unknown): LuneGoError {
  return new LuneGoError(
    'profile_import_invalid',
    message,
    cause === undefined ? {} : { cause },
  )
}

export function assertId(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(`${name} must be a non-empty string`)
  }
}

export function assertProfileSnapshot(
  value: unknown,
  where: string,
): asserts value is WorldSnapshot {
  if (!isRecord(value)) {
    throw invalid(`${where} is not a snapshot object`)
  }
  if (value['scope'] !== 'profile') {
    throw new LuneGoError('profile_scope', `${where} scope must be "profile"`)
  }
  if (value['formatVersion'] !== SNAPSHOT_FORMAT_VERSION) {
    throw new LuneGoError(
      'profile_invalid',
      `${where} format ${String(value['formatVersion'])} is not ${SNAPSHOT_FORMAT_VERSION}`,
      { rule: 'LG010' },
    )
  }
  const schemaVersion = value['schemaVersion']
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new LuneGoError('profile_invalid', `${where} schemaVersion must be a positive integer`)
  }
  const tick = value['tick']
  if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 0) {
    throw new LuneGoError('profile_invalid', `${where} tick must be a non-negative integer`)
  }
  const nextSeq = value['nextSeq']
  if (typeof nextSeq !== 'number' || !Number.isInteger(nextSeq) || nextSeq < 0) {
    throw new LuneGoError('profile_invalid', `${where} nextSeq must be a non-negative integer`)
  }
  const dt = value['dt']
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new LuneGoError('profile_invalid', `${where} dt must be positive`)
  }
  const contentHash = value['contentHash']
  if (typeof contentHash !== 'string' || contentHash.length === 0) {
    throw new LuneGoError('profile_invalid', `${where} contentHash must be a non-empty string`)
  }
  if (
    !isRecord(value['entities']) ||
    !isRecord(value['components']) ||
    !isRecord(value['models']) ||
    !isRecord(value['states'])
  ) {
    throw new LuneGoError('profile_invalid', `${where} is missing persisted state tables`)
  }
  const rng = value['rng']
  if (
    !isRecord(rng) ||
    typeof rng['seed'] !== 'number' ||
    !isRecord(rng['streams'])
  ) {
    throw new LuneGoError('profile_invalid', `${where} is missing an rng state`)
  }
  if (!Array.isArray(value['pendingCommands']) || !Array.isArray(value['previousEvents'])) {
    throw new LuneGoError('profile_invalid', `${where} is missing command/event history`)
  }
}

export function normalizeRecord(value: unknown, accountId: string, slot: string): StoredProfile {
  if (!isRecord(value)) {
    throw invalid(`profile ${accountId}/${slot} is not an object`)
  }
  if (value['formatVersion'] !== RECORD_FORMAT_VERSION) {
    throw new LuneGoError(
      'profile_invalid',
      `profile ${accountId}/${slot} has unsupported format ${String(value['formatVersion'])}`,
      { rule: 'LG010' },
    )
  }
  if (value['accountId'] !== accountId || value['slot'] !== slot) {
    throw invalid(`profile ${accountId}/${slot} belongs to another account or slot`)
  }
  const revision = value['revision']
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    throw invalid(`profile ${accountId}/${slot} revision must be a positive integer`)
  }
  if (value['scope'] !== 'profile') {
    throw new LuneGoError('profile_scope', `profile ${accountId}/${slot} scope must be "profile"`)
  }
  const snapshot = value['snapshot']
  assertProfileSnapshot(snapshot, `profile ${accountId}/${slot}`)
  if (value['schemaVersion'] !== snapshot.schemaVersion) {
    throw invalid(`profile ${accountId}/${slot} schemaVersion disagrees with its snapshot`)
  }
  if (value['tick'] !== snapshot.tick) {
    throw invalid(`profile ${accountId}/${slot} tick disagrees with its snapshot`)
  }
  if (value['contentHash'] !== snapshot.contentHash) {
    throw invalid(`profile ${accountId}/${slot} contentHash disagrees with its snapshot`)
  }
  return {
    formatVersion: RECORD_FORMAT_VERSION,
    accountId,
    slot,
    revision,
    scope: 'profile',
    tick: snapshot.tick,
    schemaVersion: snapshot.schemaVersion,
    contentHash: snapshot.contentHash,
    snapshot,
  }
}

export function slotInfo(record: StoredProfile): ProfileSlotInfo {
  return {
    slot: record.slot,
    status: 'ok',
    revision: record.revision,
    tick: record.tick,
    schemaVersion: record.schemaVersion,
    contentHash: record.contentHash,
    error: null,
  }
}

export function corruptInfo(slot: string, error: string): ProfileSlotInfo {
  return {
    slot,
    status: 'corrupt',
    revision: 0,
    tick: null,
    schemaVersion: null,
    contentHash: null,
    error,
  }
}

export function serializeRecord(
  record: StoredProfile,
  accountId: string,
  slot: string,
): string {
  try {
    return JSON.stringify(record)
  } catch (error) {
    throw invalid(`profile ${accountId}/${slot} is not JSON serializable`, error)
  }
}

export function createBundle(
  accountId: string,
  selected: string | null,
  slots: readonly StoredProfile[],
): ProfileBundle {
  return {
    kind: BUNDLE_KIND,
    formatVersion: RECORD_FORMAT_VERSION,
    accountId,
    selected,
    slots,
  }
}

export interface ParsedBundle {
  readonly accountId: string
  readonly selected: string | null
  readonly records: readonly StoredProfile[]
}

export function parseBundle(serialized: string): ParsedBundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch (error) {
    throw importInvalid('profile bundle is not valid JSON', error)
  }
  if (!isRecord(parsed)) {
    throw importInvalid('profile bundle is not an object')
  }
  if (parsed['kind'] !== BUNDLE_KIND || parsed['formatVersion'] !== RECORD_FORMAT_VERSION) {
    throw importInvalid('profile bundle has an unsupported format')
  }
  const accountId = parsed['accountId']
  if (typeof accountId !== 'string' || accountId.length === 0) {
    throw importInvalid('profile bundle accountId must be a non-empty string')
  }
  const rawSlots = parsed['slots']
  if (!Array.isArray(rawSlots)) {
    throw importInvalid('profile bundle slots must be an array')
  }
  const records: StoredProfile[] = []
  const slots = new Set<string>()
  for (const raw of rawSlots) {
    if (!isRecord(raw)) {
      throw importInvalid('profile bundle slot is not an object')
    }
    const slot = raw['slot']
    if (typeof slot !== 'string' || slot.length === 0) {
      throw importInvalid('profile bundle slot must be a non-empty string')
    }
    if (slots.has(slot)) {
      throw importInvalid(`duplicate slot ${slot} in profile bundle`)
    }
    slots.add(slot)
    const candidate: Record<string, unknown> = { ...raw, accountId, slot }
    try {
      records.push(normalizeRecord(candidate, accountId, slot))
    } catch (error) {
      throw importInvalid(
        `slot ${slot} is invalid: ${error instanceof Error ? error.message : String(error)}`,
        error,
      )
    }
  }
  const rawSelected = parsed['selected']
  if (rawSelected !== null && rawSelected !== undefined && typeof rawSelected !== 'string') {
    throw importInvalid('profile bundle selected must be a string or null')
  }
  const selected = typeof rawSelected === 'string' ? rawSelected : null
  if (selected !== null && !slots.has(selected)) {
    throw importInvalid(`selected slot ${selected} is not present in the profile bundle`)
  }
  return { accountId, selected, records }
}
