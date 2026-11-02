import { defineContent, defineContentType, definePrefab, t, type Prefab } from '@lunego/core'
import {
  buildRuntimeContent,
  createRuntimeFeature,
  registerRuntimeCatalogs,
  type RuntimeCatalogs,
  type RuntimeContent,
  type RuntimeFeatureOptions,
} from '@lunego/kit-runtime'
import type { ContentRegistry, FeatureDef } from '@lunego/core'

const EMPTY_INVENTORY = JSON.stringify({ slots: Array(10).fill(null) })

function prefab(logicalId: string, components: Readonly<Record<string, unknown>>): Prefab {
  return definePrefab(logicalId, components)
}

export const DemoCatalogs: RuntimeCatalogs = {
  portals: new Map([
    ['demo.portal', { id: 'demo.portal', from: 'demo.zone', to: 'demo.zone' }],
  ]),
  prefabs: new Map<string, Prefab>([
    ['demo.player', prefab('demo.player', {
      'runtime.actor.position': { x: 240, y: 150 },
      'runtime.actor.velocity': { x: 0, y: 0 },
      'runtime.actor.facing': { x: 1, y: 0 },
      'runtime.actor.moveSpeed': { value: 1 },
      'runtime.combat.team': { side: 'player' },
      'runtime.combat.health': { current: 40, max: 40 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.items.inventory': { snapshot: EMPTY_INVENTORY },
      'runtime.items.equipment': { snapshot: '' },
      'runtime.commerce.wallet': { gold: 50 },
      'runtime.quest.log': { snapshot: '' },
      'runtime.status.state': { snapshot: '' },
      'runtime.dialogue.state': { snapshot: '' },
      'runtime.content.tag': { contentId: 'demo.player' },
    })],
    ['demo.foe', prefab('demo.foe', {
      'runtime.actor.position': { x: 260, y: 150 },
      'runtime.actor.velocity': { x: 0, y: 0 },
      'runtime.actor.facing': { x: -1, y: 0 },
      'runtime.actor.moveSpeed': { value: 1 },
      'runtime.combat.team': { side: 'enemy' },
      'runtime.combat.health': { current: 10, max: 10 },
      'runtime.combat.defenses': { armor: 0, dodge: 0, block: 0, shield: 0, resistances: [] },
      'runtime.ai.state': {
        profile: 'demo.melee', phase: 'idle', target: 0, lastSeenTick: 0, lastAttackTick: 0,
        blacklist: [], threats: [], memory: [],
      },
      'runtime.content.tag': { contentId: 'demo.foe' },
    })],
    ['demo.crate', prefab('demo.crate', {
      'runtime.actor.position': { x: 320, y: 220 },
      'runtime.content.tag': { contentId: 'demo.crate' },
    })],
  ]),
  items: new Map([
    ['demo.blade', { id: 'demo.blade', slot: 'weapon', maxStack: 1 }],
    ['demo.potion', { id: 'demo.potion', maxStack: 5 }],
  ]),
  affixes: new Map(),
  lootTables: new Map(),
  statuses: new Map([
    ['demo.burn', { id: 'demo.burn', durationTicks: 6, maxStacks: 1, periodic: { kind: 'dot' as const, intervalTicks: 2, amount: 1 } }],
  ]),
  abilities: new Map([
    ['demo.strike', { id: 'demo.strike', ability: { id: 'demo.strike', cooldownTicks: 0 }, damage: { amount: 5, type: 'physical' } }],
  ]),
  aiProfiles: new Map([
    ['demo.melee', { id: 'demo.melee', sightRange: 180, coneDot: -1, memoryTicks: 90, leashRadius: 260, attackRange: 24, attackCooldownTicks: 60, speed: 36, ability: 'demo.strike' }],
  ]),
  encounters: new Map([
    ['demo.encounter', {
      id: 'demo.encounter',
      waves: [{
        id: 'one',
        count: 1,
        spawnPoints: [{ x: 260, y: 150 }],
        spawnTable: { entries: [{ id: 'demo.foe', weight: 1 }] },
        phase: 'start',
      }],
    }],
  ]),
  zones: new Map([
    ['demo.zone', { id: 'demo.zone', bounds: { x: 0, y: 0, width: 480, height: 270 }, chunkSize: 64, spawnBudget: 2, encounterId: 'demo.encounter' }],
  ]),
  quests: new Map([
    ['demo.quest', {
      id: 'demo.quest',
      objectives: [
        { id: 'kill', type: 'kill' as const, target: 'demo.foe', required: 1 },
        { id: 'collect', type: 'collect' as const, target: 'demo.blade', required: 1 },
      ],
    }],
  ]),
  dialogues: new Map([
    ['demo.dialogue', {
      id: 'demo.dialogue',
      nodes: [
        { id: 'start', textKey: 'demo.dialogue.start', choices: [{ id: 'accept', textKey: 'demo.dialogue.accept', next: 'end', once: true }] },
        { id: 'end', textKey: 'demo.dialogue.end' },
      ],
    }],
  ]),
  vendors: new Map([
    ['demo.vendor', { id: 'demo.vendor', stock: [{ contentId: 'demo.potion', quantity: 3 }], buy: { 'demo.potion': 10 }, sell: { 'demo.potion': 3 } }],
  ]),
  recipes: new Map(),
  progression: new Map(),
  stats: new Map(),
}

export function registerDemoContent(registry: ContentRegistry): RuntimeContent {
  registerRuntimeCatalogs(registry, DemoCatalogs)
  return buildRuntimeContent(registry, DemoCatalogs)
}

/** Assemble the generic runtime from this template's content and hook policies. */
export function createDemoRuntime(content: RuntimeContent): FeatureDef {
  const options: RuntimeFeatureOptions = {
    name: 'demo.runtime',
    content,
    hooks: {
      dropFor: () => ({ id: 'demo.drop', contentId: 'demo.blade', quantity: 1, affixes: [] }),
    },
  }
  return createRuntimeFeature(options)
}

export const DemoText = defineContentType('DemoText', { text: t.str })
export const DemoTextContent = defineContent(DemoText, {
  title: { text: 'Status' },
})
