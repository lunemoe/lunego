import {
  defineCommand,
  defineModel,
  defineQuery,
  t,
  type QueryContext,
} from '@lunego/core'
import { AbilityCooldowns, ActorPosition, CombatDead, CombatHealth, CombatTeam, EncounterStateModel, EquipmentState, GroundItem, InventoryState, QuestLogSnapshot, RuntimeQueries, WalletState, type EquipmentData } from '@lunego/kit-runtime'

export const CharacterProfile = defineModel(
  'CharacterProfile',
  { name: t.str, level: t.u16, xp: t.u32, kills: t.u32 },
  { name: 'Knight', level: 1, xp: 0, kills: 0 },
  { persist: 'profile' },
)

export const RunProgress = defineModel('p9.run', { endedAt: t.u32, stage: t.u32 }, { endedAt: 0, stage: 1 }, { persist: 'world' })

export const Start = defineCommand('p9.start', {})
export const AdvanceRun = defineCommand('p9.advance', {})
export const Revive = defineCommand('p9.revive', {})

export function gearPower(item: EquipmentData['slots'][string] | undefined): number {
  if (item === null || item === undefined) return 0
  const base = item.contentId === 'p9.relic' ? 7 : item.contentId === 'p9.blade' ? 3 : 0
  return base + item.affixes.flatMap((affix) => affix.modifiers).reduce((sum, modifier) => sum + (modifier.stat === 'power' ? modifier.value : 0), 0)
}

export interface HudItem {
  readonly slot: number
  readonly id: string
  readonly contentId: string
  readonly quantity: number
  readonly rarity: string
  readonly power: number
}

export interface HudQuest {
  readonly id: string
  readonly status: string
  readonly progress: number
}

export interface HudView {
  readonly player: number
  readonly hp: number
  readonly maxHp: number
  readonly gold: number
  readonly inventory: readonly HudItem[]
  readonly quests: readonly HudQuest[]
  readonly enemy: number
  readonly ground: number
  readonly weapon: string | null
  readonly weaponPower: number
  readonly damage: number
  readonly stage: number
  readonly wave: number
  readonly waveCount: number
  readonly phase: string
  readonly remaining: number
  readonly nextWaveTicks: number
  readonly cooldowns: { readonly strike: number; readonly burst: number }
  readonly outcome: 'playing' | 'victory' | 'defeat'
  readonly level: number
  readonly xp: number
  readonly nextLevelXp: number
  readonly kills: number
  readonly elapsed: number
}

function parseQuests(raw: string | undefined): HudQuest[] {
  if (raw === undefined || raw === '') return []
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return []
  const quests = (parsed as { quests?: unknown }).quests
  if (typeof quests !== 'object' || quests === null || Array.isArray(quests)) return []
  return Object.entries(quests).flatMap(([id, value]) => {
    if (typeof value !== 'object' || value === null) return []
    const entry = value as { status?: unknown; progress?: unknown }
    const progress = entry.progress
    let count = 0
    if (typeof progress === 'object' && progress !== null && !Array.isArray(progress)) {
      for (const item of Object.values(progress)) {
        if (typeof item === 'object' && item !== null) {
          const candidate = (item as { count?: unknown }).count
          if (typeof candidate === 'number') count += candidate
        }
      }
    }
    return [{ id, status: typeof entry.status === 'string' ? entry.status : 'unknown', progress: count }]
  })
}

export const HudQuery = defineQuery<unknown, HudView | null>({
  name: 'p9.hud',
  reads: [InventoryState, EquipmentState, CombatHealth, CombatTeam, GroundItem, WalletState, QuestLogSnapshot,
    ActorPosition, CombatDead, EncounterStateModel, AbilityCooldowns, CharacterProfile, RunProgress],
  run: (ctx: QueryContext, _args: unknown): HudView | null => {
    const player = ctx.query(InventoryState)[0]
    if (player === undefined) return null
    const health = ctx.read(CombatHealth)
    const teams = ctx.read(CombatTeam)
    const position = ctx.read(ActorPosition)
    const distance = (entity: number): number => {
      const dx = position.x[entity] - position.x[player]
      const dy = position.y[entity] - position.y[player]
      return dx * dx + dy * dy
    }
    const enemies = ctx.query(CombatTeam, CombatHealth, ActorPosition)
      .filter((entity) => teams.side[entity] === 'enemy' && !ctx.has(entity, CombatDead) && health.current[entity] > 0)
      .sort((a, b) => distance(a) - distance(b) || a - b)
    const ground = ctx.query(GroundItem, ActorPosition).sort((a, b) => distance(a) - distance(b) || a - b)[0] ?? 0
    const encounter = RuntimeQueries.encounterView(ctx)
    const cooldown = (ability: string): number => Math.max(0,
      (ctx.model(AbilityCooldowns).entries.find((entry) => entry.entity === player && entry.ability === ability)?.untilTick ?? 0) - ctx.tick)
    const profile = ctx.model(CharacterProfile)
    const hp = health.current[player] ?? 0
    const inventory = RuntimeQueries.inventoryView(ctx)?.slots ?? []
    return {
      player, hp, maxHp: health.max[player] ?? 0,
      gold: ctx.read(WalletState).gold[player] ?? 0,
      inventory: inventory.flatMap((item, slot) => item === null ? [] : [{ ...item, slot, rarity: item.rarity ?? 'common', power: gearPower(item) }]),
      quests: parseQuests(ctx.read(QuestLogSnapshot).snapshot[player]),
      enemy: enemies[0] ?? 0, ground,
      weapon: RuntimeQueries.equipmentView(ctx, player).slots['weapon']?.contentId ?? null,
      weaponPower: gearPower(RuntimeQueries.equipmentView(ctx, player).slots['weapon']),
      damage: 5 + gearPower(RuntimeQueries.equipmentView(ctx, player).slots['weapon']) + profile.level - 1,
      stage: ctx.model(RunProgress).stage,
      wave: (encounter?.waveIndex ?? 0) + 1, waveCount: 3,
      phase: encounter?.phase ?? 'Vanguard', remaining: enemies.length,
      nextWaveTicks: Math.max(0, (encounter?.nextWaveTick ?? 0) - ctx.tick),
      cooldowns: { strike: cooldown('p9.strike'), burst: cooldown('p9.burst') },
      outcome: hp <= 0 ? 'defeat' : encounter?.completed === true ? 'victory' : 'playing',
      level: profile.level, xp: profile.xp, nextLevelXp: profile.level * 20, kills: profile.kills,
      elapsed: ((ctx.model(RunProgress).endedAt || ctx.tick) - 1) * ctx.time.dt,
    }
  },
})
