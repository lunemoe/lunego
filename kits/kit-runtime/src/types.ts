import type { HandlerContext, StateDef } from '@lunego/core'
import type { ItemDef, ItemInstance } from '@lunego/kit-items'
import type { DialogueEffect } from '@lunego/kit-dialogue'
import type { QuestReward } from '@lunego/kit-quest'
import type { RuntimeContent } from './content.js'

export interface RuntimeHooks {
  readonly resolveDamage?: (
    packet: { readonly target: number; readonly source: number; readonly amount: number; readonly damageType: string },
    target: { readonly health: number; readonly shield: number; readonly armor: number; readonly dodge: number; readonly block: number },
  ) => { readonly health: number; readonly shield: number; readonly applied: number; readonly dead: boolean }
  readonly canEquip?: (def: ItemDef, slot: string) => boolean
  readonly attackDamage?: (ctx: HandlerContext, source: number, target: number, abilityId: string) => { readonly amount: number; readonly type: string } | null
  readonly dropFor?: (ctx: HandlerContext, entity: number, source: number) => ItemInstance | null
  readonly onQuestReward?: (ctx: HandlerContext, rewards: readonly QuestReward[]) => void
  readonly onDialogueEffect?: (ctx: HandlerContext, effect: DialogueEffect) => void
  readonly hasLineOfSight?: (ctx: HandlerContext, source: number, target: number) => boolean
}

export interface RuntimeFeatureOptions {
  readonly name: string
  readonly content: RuntimeContent
  readonly hooks?: RuntimeHooks
  /** Explicit read declarations for game policies injected through hooks. */
  readonly hookReads?: readonly StateDef[]
  /** World-space pickup distance. Omitted preserves unrestricted non-spatial inventories. */
  readonly pickupRange?: number
  /** Integer ticks between cleared encounter waves; defaults to zero. */
  readonly waveDelayTicks?: number
}

export interface InventoryData {
  readonly slots: readonly (ItemInstance | null)[]
}

export interface EquipmentData {
  readonly slots: Readonly<Record<string, ItemInstance | null>>
}
