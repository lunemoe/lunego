import { ContentRegistry, definePrefab, type FeatureDef, type WorldSnapshot } from '@lunego/core'
import { testWorld, type TestWorld } from '@lunego/testkit'
import {
  ActorControllable,
  AiState,
  buildRuntimeContent,
  createRuntimeFeature,
  registerRuntimeCatalogs,
  type RuntimeCatalogs,
  type RuntimeHooks,
} from '../index.js'

export const item = { id: 'fixture.sword', slot: 'weapon', maxStack: 1 }

export const catalogs: RuntimeCatalogs = {
  portals: new Map([
    ['fixture.portal', { id: 'fixture.portal', from: 'fixture.zone', to: 'fixture.zone2' }],
  ]),
  prefabs: new Map([
    ['fixture.player', definePrefab('fixture.player', {
      'runtime.actor.position': { x: 0, y: 0 },
      'runtime.actor.velocity': { x: 0, y: 0 },
      'runtime.actor.facing': { x: 1, y: 0 },
      'runtime.actor.moveSpeed': { value: 1 },
      'runtime.combat.team': { side: 'player' },
      'runtime.combat.health': { current: 20, max: 20 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.items.inventory': { snapshot: JSON.stringify({ slots: Array(10).fill(null) }) },
      'runtime.items.equipment': { snapshot: '' },
      'runtime.commerce.wallet': { gold: 50 },
      'runtime.quest.log': { snapshot: '' },
      'runtime.status.state': { snapshot: '' },
      'runtime.dialogue.state': { snapshot: '' },
      'runtime.content.tag': { contentId: 'fixture.player' },
    })],
    ['fixture.enemy', definePrefab('fixture.enemy', {
      'runtime.actor.position': { x: 2, y: 0 },
      'runtime.actor.velocity': { x: 0, y: 0 },
      'runtime.actor.facing': { x: -1, y: 0 },
      'runtime.actor.moveSpeed': { value: 1 },
      'runtime.combat.team': { side: 'enemy' },
      'runtime.combat.health': { current: 5, max: 5 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.content.tag': { contentId: 'fixture.enemy' },
    })],
    ['fixture.static', definePrefab('fixture.static', {
      'runtime.actor.position': { x: 0, y: 2 },
      'runtime.actor.velocity': { x: 9, y: 9 },
      'runtime.actor.facing': { x: 0, y: 1 },
      'runtime.combat.team': { side: 'neutral' },
      'runtime.combat.health': { current: 1, max: 1 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.content.tag': { contentId: 'fixture.static' },
    })],
  ]),
  items: new Map([['fixture.sword', item]]),
  affixes: new Map(),
  lootTables: new Map(),
  statuses: new Map([
    ['fixture.dot', { id: 'fixture.dot', durationTicks: 4, maxStacks: 2, periodic: { kind: 'dot' as const, intervalTicks: 2, amount: 1 } }],
  ]),
  abilities: new Map([
    ['fixture.attack', { id: 'fixture.attack', ability: { id: 'fixture.attack', cooldownTicks: 0 }, damage: { amount: 5, type: 'physical' } }],
  ]),
  aiProfiles: new Map([
    ['fixture.melee', { id: 'fixture.melee', sightRange: 10, coneDot: -1, memoryTicks: 4, leashRadius: 20, attackRange: 1, speed: 2, ability: 'fixture.attack' }],
    ['fixture.blind', { id: 'fixture.blind', sightRange: 0, coneDot: -1, memoryTicks: 4, leashRadius: 20, attackRange: 1, speed: 2, ability: 'fixture.attack' }],
  ]),
  encounters: new Map([
    ['fixture.encounter', { id: 'fixture.encounter', waves: [{ id: 'one', count: 1, spawnPoints: [{ x: 3, y: 0 }], spawnTable: { entries: [{ id: 'fixture.enemy', weight: 1 }] }, phase: 'start' }] }],
    ['fixture.encounter2', { id: 'fixture.encounter2', waves: [{ id: 'one', count: 1, spawnPoints: [{ x: 4, y: 0 }], spawnTable: { entries: [{ id: 'fixture.enemy', weight: 1 }] }, phase: 'other' }] }],
  ]),
  zones: new Map([
    ['fixture.zone', { id: 'fixture.zone', bounds: { x: 0, y: 0, width: 10, height: 10 }, chunkSize: 5, spawnBudget: 4, encounterId: 'fixture.encounter' }],
    ['fixture.zone2', { id: 'fixture.zone2', bounds: { x: 0, y: 0, width: 10, height: 10 }, chunkSize: 5, spawnBudget: 4 }],
  ]),
  quests: new Map([
    ['fixture.quest', { id: 'fixture.quest', objectives: [
      { id: 'kill', type: 'kill' as const, target: 'fixture.enemy', required: 1 },
      { id: 'collect', type: 'collect' as const, target: 'fixture.sword', required: 1 },
    ] }],
  ]),
  dialogues: new Map([
    ['fixture.dialogue', { id: 'fixture.dialogue', nodes: [
      { id: 'start', textKey: 'fixture.start', choices: [{ id: 'ok', textKey: 'fixture.ok', next: 'end', once: true }] },
      { id: 'end', textKey: 'fixture.end' },
    ] }],
  ]),
  vendors: new Map([
    ['fixture.vendor', { id: 'fixture.vendor', stock: [{ contentId: 'fixture.sword', quantity: 1 }], buy: { 'fixture.sword': 5 }, sell: { 'fixture.sword': 2 } }],
  ]),
  recipes: new Map(),
  progression: new Map(),
  stats: new Map(),
}

export function makeFeature(hooks: RuntimeHooks = {}) {
  const registry = new ContentRegistry()
  registerRuntimeCatalogs(registry, catalogs)
  const content = buildRuntimeContent(registry, catalogs)
  return createRuntimeFeature({ name: 'fixture.runtime', content, hooks })
}

export interface FixtureWorld {
  readonly world: TestWorld
  readonly feature: FeatureDef
  readonly player: number
  readonly enemy: number
}

export function makeWorld(hooks: RuntimeHooks = {}): FixtureWorld {
  const feature = makeFeature(hooks)
  const world = testWorld({ features: [feature], seed: 7 })
  const player = world.spawn(catalogs.prefabs.get('fixture.player')!)
  world.add(player, ActorControllable)
  const enemy = world.spawn(catalogs.prefabs.get('fixture.enemy')!)
  world.add(enemy, AiState, {
    profile: 'fixture.melee',
    phase: 'chase',
    target: player,
    lastSeenTick: 0, lastAttackTick: 0,
    blacklist: [],
    threats: [],
    memory: [],
  })
  return { world, feature, player, enemy }
}

/** Test-only helper for injecting a model snapshot before restore. */
export function snapshotWithModel(
  world: TestWorld,
  model: string,
  snapshot: string,
): WorldSnapshot {
  const parsed: unknown = JSON.parse(JSON.stringify(world.snapshot()))
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('world snapshot is invalid')
  }
  const value = parsed as WorldSnapshot
  const models = value.models as Record<string, { snapshot?: string }>
  const entry = models[model]
  if (entry === undefined) {
    throw new Error(`model ${model} is missing`)
  }
  entry.snapshot = snapshot
  return value
}
