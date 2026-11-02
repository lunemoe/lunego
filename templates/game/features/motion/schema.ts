import {
  defineCommand,
  defineComponent,
  defineModel,
  defineQuery,
  t,
  type QueryContext,
} from '@lunego/core'
import { CombatHealth, CombatTeam, GroundItem, InventoryState, QuestLogSnapshot, WalletState } from '@lunego/kit-runtime'

export const Renderable = defineComponent(
  'demo.renderable',
  { width: t.f32, height: t.f32, color: t.u32, texture: t.optional(t.asset('sprite')) },
  { persist: 'world' },
)

export const CharacterProfile = defineModel(
  'CharacterProfile',
  { name: t.str, level: t.u16 },
  { name: 'Demo', level: 1 },
  { persist: 'profile' },
)

export const Start = defineCommand('demo.start', {})

export interface HudItem {
  readonly slot: number
  readonly id: string
  readonly contentId: string
  readonly quantity: number
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
}

function parseInventory(raw: string | undefined): HudItem[] {
  if (raw === undefined || raw === '') return []
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return []
  const slots = (parsed as { slots?: unknown }).slots
  if (!Array.isArray(slots)) return []
  return slots.flatMap((slot, index) => {
    if (slot === null || typeof slot !== 'object') return []
    const value = slot as { id?: unknown; contentId?: unknown; quantity?: unknown }
    if (typeof value.id !== 'string' || typeof value.contentId !== 'string' || typeof value.quantity !== 'number') {
      return []
    }
    return [{ slot: index, id: value.id, contentId: value.contentId, quantity: value.quantity }]
  })
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
  name: 'demo.hud',
  reads: [InventoryState, CombatHealth, CombatTeam, GroundItem, WalletState, QuestLogSnapshot],
  run: (ctx: QueryContext, _args: unknown): HudView | null => {
  const player = ctx.query(InventoryState)[0]
  if (player === undefined) return null
  const health = ctx.read(CombatHealth)
  const teams = ctx.read(CombatTeam)
  const enemy = ctx.query(CombatTeam).find((entity) => entity !== player && teams.side[entity] === 'enemy') ?? 0
  const ground = ctx.query(GroundItem)[0] ?? 0
  return {
    player,
    hp: health.current[player] ?? 0,
    maxHp: health.max[player] ?? 0,
    gold: ctx.read(WalletState).gold[player] ?? 0,
    inventory: parseInventory(ctx.read(InventoryState).snapshot[player]),
    quests: parseQuests(ctx.read(QuestLogSnapshot).snapshot[player]),
    enemy,
    ground,
  }
  },
})
