import type { HandlerContext, RngStateWords } from '@lunego/core'
import type { EncounterState } from '@lunego/kit-encounter'
import { DialogueGraph, DialogueRunner, type DialogueSnapshot as DialogueRunnerSnapshot } from '@lunego/kit-dialogue'
import type { StatusSetSnapshot, StatusSnapshot } from '@lunego/kit-status'
import { QuestLog } from '@lunego/kit-quest'
import type { RuntimeContent } from './content.js'
import { ContentTag, DialogueSnapshot, EquipmentState, InventoryState } from './schema.js'
import type { EquipmentData, InventoryData, RuntimeHooks } from './types.js'
import type { ItemInstance } from '@lunego/kit-items'
import type { RolledAffix } from '@lunego/kit-loot'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error })
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function isModifierMode(value: unknown): value is 'add' | 'mul' {
  return value === 'add' || value === 'mul'
}

function parseAffix(value: unknown, label: string): RolledAffix {
  if (!isRecord(value) || typeof value['affix'] !== 'string' || !Array.isArray(value['modifiers'])) {
    throw new Error(`${label} is invalid`)
  }
  const modifiers = value['modifiers'].map((modifier, index) => {
    if (!isRecord(modifier) || typeof modifier['stat'] !== 'string') {
      throw new Error(`${label} modifier ${index} is invalid`)
    }
    const mode = modifier['mode']
    if (!isModifierMode(mode)) {
      throw new Error(`${label} modifier ${index} mode is invalid`)
    }
    return {
      stat: modifier['stat'],
      mode,
      value: finiteNumber(modifier['value'], `${label} modifier ${index} value`),
    }
  })
  return { affix: value['affix'], modifiers }
}

/** Validates a JSON item instance; used by inventory/equipment/ground snapshots. */
export function parseItemInstance(value: unknown): ItemInstance {
  if (!isRecord(value)) {
    throw new Error('item instance is invalid')
  }
  const id = value['id']
  const contentId = value['contentId']
  if (typeof id !== 'string' || id.length === 0 || typeof contentId !== 'string' || contentId.length === 0) {
    throw new Error('item instance id/contentId is invalid')
  }
  const quantity = positiveInteger(value['quantity'], 'item instance quantity')
  const rawAffixes = value['affixes']
  if (rawAffixes !== undefined && !Array.isArray(rawAffixes)) {
    throw new Error('item instance affixes is invalid')
  }
  const affixes = (rawAffixes ?? []).map((affix, index) => parseAffix(affix, `item instance affix ${index}`))
  const rarity = value['rarity']
  if (rarity !== undefined && typeof rarity !== 'string') {
    throw new Error('item instance rarity is invalid')
  }
  const rawSockets = value['sockets']
  if (rawSockets !== undefined && (!Array.isArray(rawSockets) || !rawSockets.every((socket) => socket === null || typeof socket === 'string'))) {
    throw new Error('item instance sockets is invalid')
  }
  const rawDurability = value['durability']
  if (rawDurability !== undefined && (typeof rawDurability !== 'number' || !Number.isFinite(rawDurability))) {
    throw new Error('item instance durability is invalid')
  }
  return {
    id,
    contentId,
    quantity,
    affixes,
    ...(rarity === undefined ? {} : { rarity }),
    ...(rawSockets === undefined ? {} : { sockets: rawSockets }),
    ...(rawDurability === undefined ? {} : { durability: rawDurability }),
  }
}

export function parseItemSnapshot(value: string | undefined): ItemInstance {
  if (value === undefined || value === '') {
    throw new Error('ground item snapshot is empty')
  }
  return parseItemInstance(parseJson(value, 'ground item snapshot'))
}

export function parseInventory(value: string | undefined): InventoryData {
  if (value === undefined || value === '') {
    return { slots: [] }
  }
  const parsed = parseJson(value, 'inventory snapshot')
  if (!isRecord(parsed) || !Array.isArray(parsed['slots'])) {
    throw new Error('inventory snapshot is invalid')
  }
  return {
    slots: parsed['slots'].map((slot) =>
      slot === null ? null : parseItemInstance(slot),
    ),
  }
}

export function parseEquipment(value: string | undefined): EquipmentData {
  if (value === undefined || value === '') {
    return { slots: {} }
  }
  const parsed = parseJson(value, 'equipment snapshot')
  if (!isRecord(parsed) || !isRecord(parsed['slots'])) {
    throw new Error('equipment snapshot is invalid')
  }
  const slots: Record<string, ItemInstance | null> = {}
  for (const [slot, item] of Object.entries(parsed['slots'])) {
    slots[slot] = item === null ? null : parseItemInstance(item)
  }
  return { slots }
}

export function writeInventory(ctx: HandlerContext, entity: number, data: InventoryData): void {
  ctx.write(InventoryState).snapshot[entity] = JSON.stringify(data)
}

export function writeEquipment(ctx: HandlerContext, entity: number, data: EquipmentData): void {
  ctx.write(EquipmentState).snapshot[entity] = JSON.stringify(data)
}

export function readInventory(ctx: HandlerContext, entity: number): InventoryData {
  return parseInventory(ctx.read(InventoryState).snapshot[entity])
}

export function readEquipment(ctx: HandlerContext, entity: number): EquipmentData {
  return parseEquipment(ctx.read(EquipmentState).snapshot[entity])
}

type QuestSnapshot = Parameters<QuestLog['restore']>[0]

function isQuestSnapshot(value: unknown): value is QuestSnapshot {
  return isRecord(value) &&
    value['version'] === 1 &&
    typeof value['worldDayIndex'] === 'number' &&
    Array.isArray(value['tracked']) &&
    isRecord(value['quests'])
}

export function questLog(content: RuntimeContent, snapshot: string | undefined): QuestLog {
  const log = new QuestLog({ quests: [...content.quests.values()] })
  if (snapshot !== undefined && snapshot !== '') {
    try {
      const parsed = parseJson(snapshot, 'quest snapshot')
      if (!isQuestSnapshot(parsed)) {
        throw new Error('quest snapshot has an invalid envelope')
      }
      log.restore(parsed)
    } catch (error) {
      throw new Error('quest snapshot is invalid', { cause: error })
    }
  }
  return log
}

export interface ParsedDialogueSave {
  readonly graph: string
  readonly runner: unknown
}

/** Parses the `{ graph, runner }` envelope saved in DialogueSnapshot. */
export function parseDialogueSave(value: string): ParsedDialogueSave {
  const parsed = parseJson(value, 'dialogue snapshot')
  if (!isRecord(parsed) || typeof parsed['graph'] !== 'string' || parsed['graph'].length === 0) {
    throw new Error('dialogue snapshot graph is invalid')
  }
  return { graph: parsed['graph'], runner: parsed['runner'] }
}

export function dialogueRuntime(
  content: RuntimeContent,
  graphId: string,
  snapshot: string | undefined,
  ctx: HandlerContext,
  hooks: RuntimeHooks,
): DialogueRunner {
  const def = content.dialogues.get(graphId)
  if (def === undefined) {
    throw new Error(`unknown dialogue ${graphId}`)
  }
  const graph = new DialogueGraph(def.nodes)
  const runner = new DialogueRunner({
    graph,
    context: {
      flag: () => false,
      questStatus: () => null,
    },
    hooks: {
      onEffect: (effect) => hooks.onDialogueEffect?.(ctx, effect),
    },
  })
  if (snapshot !== undefined && snapshot !== '') {
    const saved = parseDialogueSave(snapshot)
    if (saved.graph !== graphId) {
      throw new Error('dialogue snapshot is invalid for this graph')
    }
    runner.restore(parseDialogueSnapshot(saved.runner))
  }
  return runner
}

export function saveDialogue(
  ctx: HandlerContext,
  player: number,
  graph: string,
  runner: DialogueRunner,
): void {
  ctx.write(DialogueSnapshot).snapshot[player] = JSON.stringify({
    graph,
    runner: runner.serialize(),
  })
}

export function playerEntity(ctx: HandlerContext): number | undefined {
  return ctx.query(InventoryState)[0]
}

export function contentTag(ctx: HandlerContext, entity: number): string {
  return ctx.has(entity, ContentTag) ? (ctx.read(ContentTag).contentId[entity] ?? '') : ''
}

export function parseDialogueSnapshot(value: unknown): DialogueRunnerSnapshot {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['used'])) {
    throw new Error('dialogue snapshot is invalid')
  }
  const current = value['current']
  if (current !== null && typeof current !== 'string') {
    throw new Error('dialogue snapshot current is invalid')
  }
  const used: string[] = []
  for (const entry of value['used']) {
    if (typeof entry !== 'string') {
      throw new Error('dialogue snapshot used is invalid')
    }
    used.push(entry)
  }
  return { version: 1, current, used }
}

export function parseStatusSnapshot(value: string): StatusSetSnapshot {
  const parsed = parseJson(value, 'status snapshot')
  if (!isRecord(parsed) || parsed['version'] !== 1 || !Array.isArray(parsed['statuses'])) {
    throw new Error('status snapshot is invalid')
  }
  const statuses: StatusSnapshot[] = []
  for (const entry of parsed['statuses']) {
    if (!isRecord(entry)) throw new Error('status snapshot entry is invalid')
    const status = entry['status']
    const source = entry['source']
    const stacks = entry['stacks']
    const appliedTick = entry['appliedTick']
    const expiresAt = entry['expiresAt']
    const nextTick = entry['nextTick']
    if (typeof status !== 'string' || typeof source !== 'string' ||
      typeof stacks !== 'number' || typeof appliedTick !== 'number' ||
      typeof expiresAt !== 'number' || (nextTick !== null && typeof nextTick !== 'number')) {
      throw new Error('status snapshot entry is invalid')
    }
    statuses.push({ status, source, stacks, appliedTick, expiresAt, nextTick })
  }
  return { version: 1, statuses }
}

/** Reads the `{ zone }` state model; empty means no zone loaded yet. */
export function parseZoneSnapshot(value: string | undefined): string | null {
  if (value === undefined || value === '') {
    return null
  }
  const parsed = parseJson(value, 'zone snapshot')
  if (!isRecord(parsed) || typeof parsed['zone'] !== 'string' || parsed['zone'].length === 0) {
    throw new Error('zone snapshot is invalid')
  }
  return parsed['zone']
}

export interface ParsedEncounterSave {
  readonly encounter: string
  readonly runtime: EncounterState
}

function parseRngState(value: unknown): RngStateWords | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value) || value.length !== 4 || !value.every((word) =>
    typeof word === 'number' && Number.isInteger(word) && word >= 0 && word <= 0xffffffff,
  )) {
    throw new Error('encounter snapshot rngState is invalid')
  }
  return [value[0], value[1], value[2], value[3]]
}

function parseEncounterState(value: unknown): EncounterState {
  if (!isRecord(value)) throw new Error('encounter snapshot runtime is invalid')
  const waveIndex = value['waveIndex']
  const phase = value['phase']
  const spawned = value['spawned']
  const spent = value['spent']
  if (typeof waveIndex !== 'number' || !Number.isInteger(waveIndex) || waveIndex < 0) {
    throw new Error('encounter snapshot waveIndex is invalid')
  }
  if (phase !== null && typeof phase !== 'string') {
    throw new Error('encounter snapshot phase is invalid')
  }
  if (!Array.isArray(spawned)) {
    throw new Error('encounter snapshot spawned is invalid')
  }
  const entities = spawned.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry['entity'] !== 'string' ||
      typeof entry['contentId'] !== 'string' ||
      typeof entry['wave'] !== 'string'
    ) {
      throw new Error('encounter snapshot spawned entry is invalid')
    }
    return {
      entity: entry['entity'],
      contentId: entry['contentId'],
      x: finiteNumber(entry['x'], 'encounter spawned x'),
      y: finiteNumber(entry['y'], 'encounter spawned y'),
      wave: entry['wave'],
      cost: finiteNumber(entry['cost'], 'encounter spawned cost'),
    }
  })
  const rngState = parseRngState(value['rngState'])
  const state: EncounterState = {
    waveIndex,
    phase,
    spawned: entities,
    spent: finiteNumber(spent, 'encounter spent'),
  }
  return rngState === undefined ? state : { ...state, rngState }
}

/** Parses the encounter model envelope `{ encounter, runtime }`. */
export function parseEncounterSave(value: string | undefined): ParsedEncounterSave | null {
  if (value === undefined || value === '') {
    return null
  }
  const parsed = parseJson(value, 'encounter snapshot')
  if (!isRecord(parsed) || typeof parsed['encounter'] !== 'string' || parsed['encounter'].length === 0) {
    throw new Error('encounter snapshot encounter is invalid')
  }
  return { encounter: parsed['encounter'], runtime: parseEncounterState(parsed['runtime']) }
}
