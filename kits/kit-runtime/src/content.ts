import {
  hashValues,
  t,
  type ContentRegistry,
  defineContent,
  parseContentId,
  type ContentPack,
  type ContentTypeDef,
  type Prefab,
} from '@lunego/core'
import type { AbilityDefinition } from '@lunego/kit-ability'
import type { EncounterDef } from '@lunego/kit-encounter'
import type { ItemDef } from '@lunego/kit-items'
import type { AffixDefinition, LootTable } from '@lunego/kit-loot'
import type { QuestDef } from '@lunego/kit-quest'
import type { DialogueNode } from '@lunego/kit-dialogue'
import type { ProgressionNode } from '@lunego/kit-progression'
import type { StatDefinition } from '@lunego/kit-stats'
import type { StatusDef } from '@lunego/kit-status'
import type { ZoneDef } from '@lunego/kit-zone'
import {
  AffixDefContent,
  PrefabContent,
  PortalContent,
  AiProfileContent,
  AbilityDefContent,
  DialogueContent,
  EncounterDefContent,
  ItemDefContent,
  LootTableContent,
  ProgressionContent,
  QuestDefContent,
  RecipeDefContent,
  StatDefContent,
  StatusDefContent,
  VendorDefContent,
  ZoneDefContent,
} from './schema.js'

export interface RuntimePortalDef {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface RuntimeAiProfile {
  readonly id: string
  readonly sightRange: number
  readonly coneDot: number
  readonly memoryTicks: number
  readonly leashRadius: number
  readonly attackRange: number
  readonly attackCooldownTicks?: number
  readonly speed: number
  readonly ability?: string
}

export interface RuntimeAbilityDef {
  readonly id: string
  readonly ability: AbilityDefinition
  readonly damage?: { readonly amount: number; readonly type: string }
  readonly status?: string
  /** Optional splash radius around the validated target, in world units. */
  readonly areaRadius?: number
}

export interface RuntimeItemDef extends ItemDef {
  /** Consumable health restoration; gameplay values come from the catalog. */
  readonly heal?: number
}

export interface RuntimeVendorDef {
  readonly id: string
  readonly stock: readonly { readonly contentId: string; readonly quantity: number }[]
  readonly buy: Readonly<Record<string, number>>
  readonly sell: Readonly<Record<string, number>>
}

export interface RuntimeRecipeDef {
  readonly id: string
  readonly inputs: readonly { readonly contentId: string; readonly quantity: number }[]
  readonly outputs: readonly { readonly contentId: string; readonly quantity: number }[]
}

export interface RuntimeProgressionDef {
  readonly id: string
  readonly thresholds: readonly number[]
  readonly nodes: readonly ProgressionNode[]
}

export interface RuntimeDialogueDef {
  readonly id: string
  readonly nodes: readonly DialogueNode[]
}

export interface RuntimeCatalogs {
  readonly prefabs: ReadonlyMap<string, Prefab>
  readonly portals: ReadonlyMap<string, RuntimePortalDef>
  readonly items: ReadonlyMap<string, RuntimeItemDef>
  readonly affixes: ReadonlyMap<string, AffixDefinition>
  readonly lootTables: ReadonlyMap<string, LootTable>
  readonly statuses: ReadonlyMap<string, StatusDef>
  readonly abilities: ReadonlyMap<string, RuntimeAbilityDef>
  readonly aiProfiles: ReadonlyMap<string, RuntimeAiProfile>
  readonly encounters: ReadonlyMap<string, EncounterDef>
  readonly zones: ReadonlyMap<string, ZoneDef>
  readonly quests: ReadonlyMap<string, QuestDef>
  readonly dialogues: ReadonlyMap<string, RuntimeDialogueDef>
  readonly vendors: ReadonlyMap<string, RuntimeVendorDef>
  readonly recipes: ReadonlyMap<string, RuntimeRecipeDef>
  readonly progression: ReadonlyMap<string, RuntimeProgressionDef>
  readonly stats: ReadonlyMap<string, StatDefinition>
}

export type RuntimeContent = RuntimeCatalogs

function canonical(value: unknown, seen: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('content values must contain only finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry, seen)).join(',')}]`
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('content values must be plain JSON objects; functions/classes are not allowed')
    }
    if (seen.has(value)) throw new Error('content values must not contain cycles')
    seen.add(value)
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    const body = entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry, seen)}`).join(',')
    seen.delete(value)
    return `{${body}}`
  }
  throw new Error('content values must be JSON-serializable data; functions/undefined are not allowed')
}

export function runtimeValueHash(value: unknown): string {
  return hashValues([[t.str, canonical(value, new Set())]])
}

function contentPack<Name extends string>(
  type: ContentTypeDef<Name, { readonly id: string; readonly hash: string }>,
  values: ReadonlyMap<string, unknown>,
): ContentPack<Name, { readonly id: string; readonly hash: string }> {
  return defineContent(type, Object.fromEntries([...values.keys()].map((id) => [id, { id, hash: runtimeValueHash(values.get(id)) }])))
}

function requireId(map: ReadonlyMap<string, unknown>, id: string, owner: string): void {
  if (!map.has(id)) {
    throw new Error(`${owner} references missing content ${id}`)
  }
}

/** Registers the ID-only content types for a catalog set. */
export function registerRuntimeCatalogs(registry: ContentRegistry, catalogs: RuntimeCatalogs): void {
  const packs = [
    contentPack(PrefabContent, catalogs.prefabs),
    contentPack(ItemDefContent, catalogs.items),
    contentPack(AffixDefContent, catalogs.affixes),
    contentPack(LootTableContent, catalogs.lootTables),
    contentPack(StatusDefContent, catalogs.statuses),
    contentPack(AbilityDefContent, catalogs.abilities),
    contentPack(AiProfileContent, catalogs.aiProfiles),
    contentPack(EncounterDefContent, catalogs.encounters),
    contentPack(ZoneDefContent, catalogs.zones),
    contentPack(PortalContent, catalogs.portals),
    contentPack(QuestDefContent, catalogs.quests),
    contentPack(DialogueContent, catalogs.dialogues),
    contentPack(VendorDefContent, catalogs.vendors),
    contentPack(RecipeDefContent, catalogs.recipes),
    contentPack(ProgressionContent, catalogs.progression),
    contentPack(StatDefContent, catalogs.stats),
  ]
  for (const pack of packs) {
    registry.addPack(pack)
  }
}

function validate(catalogs: RuntimeCatalogs): void {
  for (const item of catalogs.items.values()) {
    if (item.heal !== undefined && (!Number.isFinite(item.heal) || item.heal <= 0)) throw new Error(`item ${item.id} has invalid heal`)
  }
  for (const def of catalogs.abilities.values()) {
    if (!Number.isInteger(def.ability.cooldownTicks) || def.ability.cooldownTicks < 0) throw new Error(`ability ${def.id} has invalid cooldown`)
    for (const distance of [def.areaRadius, def.ability.target?.range]) {
      if (distance !== undefined && (!Number.isFinite(distance) || distance < 0)) throw new Error(`ability ${def.id} has invalid range`)
    }
  }
  for (const encounter of catalogs.encounters.values()) {
    for (const table of Object.keys(encounter.lootTables ?? {})) {
      requireId(catalogs.lootTables, table, `encounter ${encounter.id}.lootTables`)
    }
    for (const wave of encounter.waves) {
      for (const entry of wave.spawnTable.entries) {
        requireId(catalogs.prefabs, entry.id, `encounter ${encounter.id}.spawn`)
      }
    }
  }
  for (const zone of catalogs.zones.values()) {
    if (zone.encounterId !== undefined) {
      requireId(catalogs.encounters, zone.encounterId, `zone ${zone.id}.encounterId`)
    }
  }
  for (const portal of catalogs.portals.values()) {
    requireId(catalogs.zones, portal.from, `portal ${portal.id}.from`)
    requireId(catalogs.zones, portal.to, `portal ${portal.id}.to`)
  }
  for (const quest of catalogs.quests.values()) {
    for (const id of [...(quest.prerequisites ?? []), ...(quest.chain === undefined ? [] : [quest.chain])]) {
      requireId(catalogs.quests, id, `quest ${quest.id}`)
    }
    for (const objective of quest.objectives) {
      if (objective.type === 'collect') {
        requireId(catalogs.items, objective.target, `quest ${quest.id}.collect`)
      }
    }
  }
  for (const dialogue of catalogs.dialogues.values()) {
    for (const node of dialogue.nodes) {
      for (const condition of [...(node.conditions ?? []), ...(node.choices ?? []).flatMap((choice) => choice.conditions ?? [])]) {
        if (condition.kind === 'quest') {
          requireId(catalogs.quests, condition.key, `dialogue ${dialogue.id}`)
        }
      }
    }
  }
  for (const vendor of catalogs.vendors.values()) {
    for (const entry of vendor.stock) {
      requireId(catalogs.items, entry.contentId, `vendor ${vendor.id}.stock`)
    }
  }
  for (const recipe of catalogs.recipes.values()) {
    for (const entry of [...recipe.inputs, ...recipe.outputs]) {
      requireId(catalogs.items, entry.contentId, `recipe ${recipe.id}`)
    }
  }
  for (const progression of catalogs.progression.values()) {
    const nodes = new Set(progression.nodes.map((node) => node.id))
    for (const node of progression.nodes) {
      for (const requirement of node.requires ?? []) {
        if (!nodes.has(requirement.id)) {
          throw new Error(`progression ${progression.id} node ${node.id} requires missing ${requirement.id}`)
        }
      }
      for (const ability of node.abilities ?? []) {
        requireId(catalogs.abilities, ability, `progression ${progression.id}.${node.id}`)
      }
    }
  }
}

/** Validates every catalog cross-reference, then returns the immutable catalog map. */
export function buildRuntimeContent(
  registry: ContentRegistry,
  catalogs: RuntimeCatalogs,
): RuntimeContent {
  const checks: Array<[ContentTypeDef<string, { readonly id: string; readonly hash: string }>, ReadonlyMap<string, unknown>]> = [
    [PrefabContent, catalogs.prefabs],
    [ItemDefContent, catalogs.items],
    [AffixDefContent, catalogs.affixes],
    [LootTableContent, catalogs.lootTables],
    [StatusDefContent, catalogs.statuses],
    [AbilityDefContent, catalogs.abilities],
    [AiProfileContent, catalogs.aiProfiles],
    [EncounterDefContent, catalogs.encounters],
    [ZoneDefContent, catalogs.zones],
    [PortalContent, catalogs.portals],
    [QuestDefContent, catalogs.quests],
    [DialogueContent, catalogs.dialogues],
    [VendorDefContent, catalogs.vendors],
    [RecipeDefContent, catalogs.recipes],
    [ProgressionContent, catalogs.progression],
    [StatDefContent, catalogs.stats],
  ]
  for (const [type, map] of checks) {
    for (const id of map.keys()) {
      const contentId = parseContentId(type, id)
      if (!registry.has(type, contentId)) {
        throw new Error(`content registry is missing ${id}`)
      }
      const registered = registry.get(type, contentId)
      if (registered.hash !== runtimeValueHash(map.get(id))) {
        throw new Error(`content registry hash is stale for ${id}`)
      }
    }
  }
  validate(catalogs)
  return { ...catalogs }
}
