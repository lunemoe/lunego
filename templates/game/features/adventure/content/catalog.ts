import { definePrefab, type Prefab } from '@lunego/core'
import {
  buildRuntimeContent,
  createRuntimeFeature,
  registerRuntimeCatalogs,
  type RuntimeCatalogs,
  type RuntimeContent,
  type RuntimeFeatureOptions,
  ContentTag, EquipmentState, RuntimeQueries,
} from '@lunego/kit-runtime'
import type { ContentRegistry, FeatureDef } from '@lunego/core'
import { rollLoot } from '@lunego/kit-loot'
import { CharacterProfile, RunProgress, gearPower } from '../schema.js'
import { AssetPack } from '../../_generated/assets.js'
import { GearTable } from './gear.js'

function enemy(id: string, health: number, profile: string): Prefab {
  return prefab(id, {
    'runtime.actor.position': { x: 360, y: 120 },
    'runtime.actor.velocity': { x: 0, y: 0 },
    'runtime.actor.facing': { x: -1, y: 0 },
    'runtime.actor.moveSpeed': { value: 1 },
    'runtime.combat.team': { side: 'enemy' },
    'runtime.combat.health': { current: health, max: health },
    'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
    'runtime.ai.state': { profile, phase: 'idle', target: 0, lastSeenTick: 0, lastAttackTick: 0, blacklist: [], threats: [], memory: [] },
    'runtime.content.tag': { contentId: id },
  })
}

const EMPTY_INVENTORY = JSON.stringify({ slots: [
  { id: 'starter-potions', contentId: 'p9.potion', quantity: 3, affixes: [] },
  ...Array(9).fill(null),
] })

function prefab(logicalId: string, components: Readonly<Record<string, unknown>>): Prefab {
  return definePrefab(logicalId, components)
}

export const P9Catalogs: RuntimeCatalogs = {
  portals: new Map([
    ['p9.portal', { id: 'p9.portal', from: 'p9.zone', to: 'p9.zone' }],
  ]),
  prefabs: new Map<string, Prefab>([
    ['p9.player', prefab('p9.player', {
      'runtime.actor.position': { x: 240, y: 150 },
      'runtime.actor.velocity': { x: 0, y: 0 },
      'runtime.actor.facing': { x: 1, y: 0 },
      'runtime.actor.moveSpeed': { value: 90 },
      'runtime.combat.team': { side: 'player' },
      'runtime.combat.health': { current: 40, max: 40 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.items.inventory': { snapshot: EMPTY_INVENTORY },
      'runtime.items.equipment': { snapshot: '' },
      'runtime.commerce.wallet': { gold: 50 },
      'runtime.quest.log': { snapshot: '' },
      'runtime.status.state': { snapshot: '' },
      'runtime.dialogue.state': { snapshot: '' },
      'runtime.content.tag': { contentId: 'p9.player' },
    })],
    ['p9.foe', prefab('p9.foe', {
      'runtime.actor.position': { x: 260, y: 150 },
      'runtime.actor.velocity': { x: 0, y: 0 },
      'runtime.actor.facing': { x: -1, y: 0 },
      'runtime.actor.moveSpeed': { value: 1 },
      'runtime.combat.team': { side: 'enemy' },
      'runtime.combat.health': { current: 10, max: 10 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.ai.state': {
        profile: 'p9.melee', phase: 'idle', target: 0, lastSeenTick: 0, lastAttackTick: 0,
        blacklist: [], threats: [], memory: [],
      },
      'runtime.content.tag': { contentId: 'p9.foe' },
    })],
    ['p9.runner', enemy('p9.runner', 14, 'p9.runner-ai')],
    ['p9.warden', enemy('p9.warden', 75, 'p9.warden-ai')],
    ['p9.crate', prefab('p9.crate', {
      'runtime.actor.position': { x: 320, y: 220 },
      'runtime.content.tag': { contentId: 'p9.crate' },
    })],
  ]),
  items: new Map([
    ['p9.blade', { id: 'p9.blade', slot: 'weapon', maxStack: 1 }],
    ['p9.potion', { id: 'p9.potion', maxStack: 5, heal: 18 }],
    ['p9.relic', { id: 'p9.relic', slot: 'weapon', maxStack: 1 }],
  ]),
  affixes: new Map(GearTable.affixes.map((affix) => [affix.id, affix])),
  lootTables: new Map([['p9.gear', GearTable]]),
  statuses: new Map([
    ['p9.burn', { id: 'p9.burn', durationTicks: 6, maxStacks: 1, periodic: { kind: 'dot' as const, intervalTicks: 2, amount: 1 } }],
  ]),
  abilities: new Map([
    ['p9.strike', { id: 'p9.strike', ability: { id: 'p9.strike', cooldownTicks: 18, target: { kind: 'nearest' as const, range: 46 } }, damage: { amount: 5, type: 'physical' } }],
    ['p9.burst', { id: 'p9.burst', ability: { id: 'p9.burst', cooldownTicks: 180, target: { kind: 'nearest' as const, range: 90 } }, damage: { amount: 16, type: 'arcane' }, areaRadius: 44 }],
    ['p9.bite', { id: 'p9.bite', ability: { id: 'p9.bite', cooldownTicks: 90 }, damage: { amount: 3, type: 'physical' } }],
    ['p9.slam', { id: 'p9.slam', ability: { id: 'p9.slam', cooldownTicks: 70 }, damage: { amount: 7, type: 'physical' } }],
  ]),
  aiProfiles: new Map([
    ['p9.runner-ai', { id: 'p9.runner-ai', sightRange: 600, coneDot: -1, memoryTicks: 90, leashRadius: 600, attackRange: 16, attackCooldownTicks: 100, speed: 44, ability: 'p9.bite' }],
    ['p9.warden-ai', { id: 'p9.warden-ai', sightRange: 600, coneDot: -1, memoryTicks: 90, leashRadius: 600, attackRange: 28, attackCooldownTicks: 90, speed: 22, ability: 'p9.slam' }],
    ['p9.enraged-ai', { id: 'p9.enraged-ai', sightRange: 600, coneDot: -1, memoryTicks: 90, leashRadius: 600, attackRange: 28, attackCooldownTicks: 70, speed: 38, ability: 'p9.slam' }],
    ['p9.melee', { id: 'p9.melee', sightRange: 600, coneDot: -1, memoryTicks: 90, leashRadius: 600, attackRange: 18, attackCooldownTicks: 90, speed: 26, ability: 'p9.bite' }],
  ]),
  encounters: new Map([
    ['p9.encounter', {
      id: 'p9.encounter',
      waves: [{
        id: 'one',
        count: 3,
        spawnPoints: [{ x: 276, y: 150 }, { x: 390, y: 70 }, { x: 80, y: 210 }],
        spawnTable: { entries: [{ id: 'p9.foe', weight: 1 }] },
        phase: 'Wave 1',
      }, {
        id: 'two', count: 4,
        spawnPoints: [{ x: 70, y: 60 }, { x: 410, y: 220 }, { x: 390, y: 60 }, { x: 70, y: 220 }],
        spawnTable: { entries: [{ id: 'p9.runner', weight: 1 }] }, phase: 'Wave 2',
      }, {
        id: 'three', count: 1, spawnPoints: [{ x: 360, y: 120 }],
        spawnTable: { entries: [{ id: 'p9.warden', weight: 1 }] }, phase: 'Boss',
      }],
    }],
  ]),
  zones: new Map([
    ['p9.zone', { id: 'p9.zone', bounds: { x: 16, y: 16, width: 448, height: 238 }, chunkSize: 64, spawnBudget: 8, encounterId: 'p9.encounter' }],
  ]),
  quests: new Map([
    ['p9.quest', {
      id: 'p9.quest',
      objectives: [
        { id: 'kill', type: 'kill' as const, target: 'p9.foe', required: 1 },
        { id: 'collect', type: 'collect' as const, target: 'p9.blade', required: 1 },
      ],
    }],
  ]),
  dialogues: new Map([
    ['p9.dialogue', {
      id: 'p9.dialogue',
      nodes: [
        { id: 'start', textKey: 'p9.dialogue.start', choices: [{ id: 'accept', textKey: 'p9.dialogue.accept', next: 'end', once: true }] },
        { id: 'end', textKey: 'p9.dialogue.end' },
      ],
    }],
  ]),
  vendors: new Map([
    ['p9.vendor', { id: 'p9.vendor', stock: [{ contentId: 'p9.potion', quantity: 3 }], buy: { 'p9.potion': 10 }, sell: { 'p9.potion': 3, 'p9.blade': 5, 'p9.relic': 15 } }],
  ]),
  recipes: new Map(),
  progression: new Map(),
  stats: new Map(),
}

export function registerP9Content(registry: ContentRegistry): RuntimeContent {
  registry.setAssetPack(AssetPack)
  registerRuntimeCatalogs(registry, P9Catalogs)
  return buildRuntimeContent(registry, P9Catalogs)
}

/** Assemble the generic runtime from this template's content and hook policies. */
export function createP9Runtime(content: RuntimeContent): FeatureDef {
  const options: RuntimeFeatureOptions = {
    name: 'p9.runtime',
    content,
    hookReads: [RunProgress, CharacterProfile],
    pickupRange: 40,
    waveDelayTicks: 150,
    hooks: {
      attackDamage: (ctx, source, _target, ability) => {
        const damage = content.abilities.get(ability)?.damage
        if (damage === undefined) return null
        const player = ctx.has(source, EquipmentState)
        const weapon = player ? RuntimeQueries.equipmentView(ctx, source).slots['weapon'] : undefined
        const stage = ctx.model(RunProgress).stage
        const amount = player ? damage.amount + gearPower(weapon) + ctx.model(CharacterProfile).level - 1
          : damage.amount * (1 + (stage - 1) * 0.2)
        return { ...damage, amount }
      },
      dropFor: (ctx, entity) => {
        const id = ctx.read(ContentTag).contentId[entity]
        if (id === 'p9.player') return null
        const contentId = id === 'p9.warden' ? 'p9.relic' : id === 'p9.runner' ? 'p9.potion' : 'p9.blade'
        const stage = ctx.model(RunProgress).stage
        const table = id === 'p9.warden' ? { ...GearTable, rarities: [{ id: 'rare', weight: 1, minAffixes: 1, maxAffixes: 1 }] } : GearTable
        const roll = contentId === 'p9.potion' ? { rarity: 'common', affixes: [] } : rollLoot(ctx.rng('loot'), table)
        const affixes = roll.affixes.map((affix) => ({ ...affix, modifiers: affix.modifiers.map((modifier) => ({
          ...modifier, value: modifier.value + stage - 1 + (roll.rarity === 'rare' ? stage : 0),
        })) }))
        return { id: `drop-${entity}-${ctx.tick}`, contentId, quantity: 1, rarity: roll.rarity, affixes }
      },
    },
  }
  return createRuntimeFeature(options)
}
