import {
  defineCommand,
  defineComponent,
  defineContentType,
  defineEvent,
  defineModel,
  defineTag,
  t,
  type ArrayType,
  type CommandDef,
  type ComponentDef,
  type ContentTypeDef,
  type EventDef,
  type ModelDef,
  type OptionalType,
  type RefType,
  type ScalarType,
  type StructType,
  type TagDef,
} from '@lunego/core'

type F32 = ScalarType<number, 'f32'>
type I32 = ScalarType<number, 'i32'>
type U32 = ScalarType<number, 'u32'>
type EntityType = ScalarType<number, 'entity'>
type StringType = { readonly kind: 'str'; readonly _type?: string }

function contentType<const Name extends string>(name: Name): ContentTypeDef<Name, { readonly id: string; readonly hash: string }> {
  return defineContentType(name, { id: t.str, hash: t.str })
}

export const PrefabContent = contentType('runtime.Prefab')
export const ItemDefContent = contentType('runtime.ItemDef')
export const AffixDefContent = contentType('runtime.AffixDef')
export const LootTableContent = contentType('runtime.LootTable')
export const StatusDefContent = contentType('runtime.StatusDef')
export const AbilityDefContent = contentType('runtime.AbilityDef')
export const AiProfileContent = contentType('runtime.AiProfile')
export const EncounterDefContent = contentType('runtime.EncounterDef')
export const ZoneDefContent = contentType('runtime.ZoneDef')
export const PortalContent = contentType('runtime.Portal')
export const QuestDefContent = contentType('runtime.QuestDef')
export const DialogueContent = contentType('runtime.Dialogue')
export const VendorDefContent = contentType('runtime.VendorDef')
export const RecipeDefContent = contentType('runtime.RecipeDef')
export const ProgressionContent = contentType('runtime.Progression')
export const StatDefContent = contentType('runtime.StatDef')

export const runtimeContentTypes = [
  PrefabContent,
  ItemDefContent,
  AffixDefContent,
  LootTableContent,
  StatusDefContent,
  AbilityDefContent,
  AiProfileContent,
  EncounterDefContent,
  ZoneDefContent,
  PortalContent,
  QuestDefContent,
  DialogueContent,
  VendorDefContent,
  RecipeDefContent,
  ProgressionContent,
  StatDefContent,
] as const

type Pair = { readonly x: F32; readonly y: F32 }

export const ActorPosition: ComponentDef<Pair> = defineComponent(
  'runtime.actor.position',
  { x: t.f32, y: t.f32 },
  { persist: 'world', interpolate: true },
)
export const ActorVelocity: ComponentDef<Pair> = defineComponent(
  'runtime.actor.velocity',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)
export const ActorFacing: ComponentDef<Pair> = defineComponent(
  'runtime.actor.facing',
  { x: t.f32, y: t.f32 },
  { persist: 'world' },
)
export const ActorControllable: TagDef = defineTag('runtime.actor.controllable', { persist: 'world' })
export const ActorMoveSpeed: ComponentDef<{ readonly value: F32 }> = defineComponent(
  'runtime.actor.moveSpeed',
  { value: t.f32 },
  { persist: 'world' },
)
export const CombatTeam: ComponentDef<{ readonly side: StringType }> = defineComponent(
  'runtime.combat.team',
  { side: t.str },
  { persist: 'world' },
)
export const CombatHealth: ComponentDef<{ readonly current: F32; readonly max: F32 }> = defineComponent(
  'runtime.combat.health',
  { current: t.f32, max: t.f32 },
  { persist: 'world' },
)
type ResistanceShape = { readonly type: StringType; readonly value: F32 }
export const CombatDefenses: ComponentDef<{
  readonly armor: F32
  readonly dodge: F32
  readonly block: F32
  readonly shield: F32
  readonly resistances: ArrayType<StructType<ResistanceShape>>
}> = defineComponent(
  'runtime.combat.defenses',
  {
    armor: t.f32,
    dodge: t.f32,
    block: t.f32,
    shield: t.f32,
    resistances: t.array(t.struct({ type: t.str, value: t.f32 })),
  },
  { persist: 'world' },
)
export const ContentTag: ComponentDef<{ readonly contentId: StringType }> = defineComponent(
  'runtime.content.tag',
  { contentId: t.str },
  { persist: 'world' },
)
export const ItemDropped: EventDef<{ readonly entity: EntityType; readonly item: StringType }> = defineEvent(
  'runtime.items.dropped',
  { entity: t.entity, item: t.str },
)
export const ActorSpawned: EventDef<{ readonly entity: EntityType; readonly prefab: StringType }> = defineEvent(
  'runtime.actor.spawned',
  { entity: t.entity, prefab: t.str },
)
export const CombatDead: TagDef = defineTag('runtime.combat.dead', { persist: 'world' })
export const StatusState: ComponentDef<{ readonly snapshot: StringType }> = defineComponent(
  'runtime.status.state',
  { snapshot: t.str },
  { persist: 'world' },
)
type AiThreat = { readonly entity: EntityType; readonly threat: F32 }
type AiMemory = {
  readonly entity: EntityType
  readonly x: F32
  readonly y: F32
  readonly lastSeenTick: U32
}
export const AiState: ComponentDef<{
  readonly profile: StringType
  readonly phase: StringType
  readonly target: EntityType
  readonly lastSeenTick: U32
  readonly lastAttackTick: U32
  readonly blacklist: ArrayType<EntityType>
  readonly threats: ArrayType<StructType<AiThreat>>
  readonly memory: ArrayType<StructType<AiMemory>>
}> = defineComponent(
  'runtime.ai.state',
  {
    profile: t.str,
    phase: t.str,
    target: t.entity,
    lastSeenTick: t.u32,
    lastAttackTick: t.u32,
    blacklist: t.array(t.entity),
    threats: t.array(t.struct({ entity: t.entity, threat: t.f32 })),
    memory: t.array(t.struct({ entity: t.entity, x: t.f32, y: t.f32, lastSeenTick: t.u32 })),
  },
  { persist: 'world' },
)
export const GroundItem: ComponentDef<{ readonly item: StringType }> = defineComponent(
  'runtime.items.ground',
  { item: t.str },
  { persist: 'world' },
)
export const InventoryState: ComponentDef<{ readonly snapshot: StringType }> = defineComponent(
  'runtime.items.inventory',
  { snapshot: t.str },
  { persist: 'profile' },
)
export const EquipmentState: ComponentDef<{ readonly snapshot: StringType }> = defineComponent(
  'runtime.items.equipment',
  { snapshot: t.str },
  { persist: 'profile' },
)
export const WalletState: ComponentDef<{ readonly gold: I32 }> = defineComponent(
  'runtime.commerce.wallet',
  { gold: t.i32 },
  { persist: 'profile' },
)
export const ProgressionSnapshot: ComponentDef<{ readonly snapshot: StringType }> = defineComponent(
  'runtime.progression.state',
  { snapshot: t.str },
  { persist: 'profile' },
)
export const QuestLogSnapshot: ComponentDef<{ readonly snapshot: StringType }> = defineComponent(
  'runtime.quest.log',
  { snapshot: t.str },
  { persist: 'profile' },
)
export const DialogueSnapshot: ComponentDef<{ readonly snapshot: StringType }> = defineComponent(
  'runtime.dialogue.state',
  { snapshot: t.str },
  { persist: 'profile' },
)
export const EncounterMember: ComponentDef<{
  readonly encounter: StringType
  readonly wave: StringType
  readonly spawnKey: StringType
}> = defineComponent(
  'runtime.encounter.member',
  { encounter: t.str, wave: t.str, spawnKey: t.str },
  { persist: 'world' },
)
export const EncounterStateModel: ModelDef<{
  readonly snapshot: StringType
  readonly completed: ScalarType<boolean, 'bool'>
  readonly nextWaveTick: U32
  readonly spawnTick: U32
}> = defineModel(
  'runtime.encounter.state',
  { snapshot: t.str, completed: t.bool, nextWaveTick: t.u32, spawnTick: t.u32 },
  { snapshot: '', completed: false, nextWaveTick: 0, spawnTick: 0 },
  { persist: 'world' },
)
export const ZoneStateModel: ModelDef<{ readonly snapshot: StringType }> = defineModel(
  'runtime.zone.state',
  { snapshot: t.str },
  { snapshot: '' },
  { persist: 'world' },
)
export const ItemIdentityModel: ModelDef<{ readonly sequence: I32; readonly splitSequence: I32 }> = defineModel(
  'runtime.items.identity',
  { sequence: t.i32, splitSequence: t.i32 },
  { sequence: 1, splitSequence: 1 },
  { persist: 'profile' },
)
export const FogStateModel: ModelDef<{ readonly snapshot: StringType }> = defineModel(
  'runtime.zone.fog',
  { snapshot: t.str },
  { snapshot: '' },
  { persist: 'profile' },
)

type CooldownEntry = { readonly entity: EntityType; readonly ability: StringType; readonly untilTick: U32 }
export const AbilityCooldowns: ModelDef<{ readonly entries: ArrayType<StructType<CooldownEntry>> }> = defineModel(
  'runtime.ability.cooldowns',
  { entries: t.array(t.struct({ entity: t.entity, ability: t.str, untilTick: t.u32 })) },
  { entries: [] },
  { persist: 'world' },
)

export const AbilityUsed: EventDef<{ readonly source: EntityType; readonly target: EntityType; readonly ability: StringType }> = defineEvent('runtime.ability.used', {
  source: t.entity, target: t.entity, ability: t.str,
})

export const EncounterCompleted: EventDef<{ readonly encounter: StringType }> = defineEvent('runtime.encounter.completed', { encounter: t.str })

type DamageShape = {
  readonly target: EntityType
  readonly source: EntityType
  readonly amount: F32
  readonly damageType: StringType
}
export const DamageRequested: EventDef<DamageShape> = defineEvent('runtime.combat.damageRequested', {
  target: t.entity,
  source: t.entity,
  amount: t.f32,
  damageType: t.str,
})
export const Damaged: EventDef<DamageShape> = defineEvent('runtime.combat.damaged', {
  target: t.entity,
  source: t.entity,
  amount: t.f32,
  damageType: t.str,
})
export const Died: EventDef<{ readonly target: EntityType; readonly source: EntityType }> = defineEvent(
  'runtime.combat.died',
  { target: t.entity, source: t.entity },
)
export const StatusPeriodic: EventDef<{
  readonly target: EntityType
  readonly status: StringType
  readonly kind: StringType
  readonly amount: F32
}> = defineEvent('runtime.status.periodic', {
  target: t.entity,
  status: t.str,
  kind: t.str,
  amount: t.f32,
})
export const QuestChanged: EventDef<{ readonly quest: StringType; readonly status: StringType }> = defineEvent(
  'runtime.quest.changed',
  { quest: t.str, status: t.str },
)
export const ItemPicked: EventDef<{ readonly entity: EntityType; readonly item: StringType }> = defineEvent(
  'runtime.items.picked',
  { entity: t.entity, item: t.str },
)
export const EncounterPhaseChanged: EventDef<{ readonly encounter: StringType; readonly phase: StringType }> = defineEvent(
  'runtime.encounter.phase',
  { encounter: t.str, phase: t.str },
)
export const ZoneChanged: EventDef<{ readonly zone: StringType }> = defineEvent(
  'runtime.zone.changed',
  { zone: t.str },
)
export const DialogueChanged: EventDef<{ readonly node: StringType }> = defineEvent(
  'runtime.dialogue.changed',
  { node: t.str },
)

type MoveShape = { readonly x: F32; readonly y: F32 }
export const ApplyStatus: CommandDef<{
  readonly target: EntityType
  readonly status: RefType<'runtime.StatusDef'>
  readonly source: StringType
  readonly stacks: I32
}> = defineCommand('runtime.status.apply', {
  target: t.entity,
  status: t.ref(StatusDefContent),
  source: t.str,
  stacks: t.i32,
})
type SpawnShape = {
  readonly prefab: StringType
  readonly controllable: OptionalType<ScalarType<boolean, 'bool'>>
}
export const SpawnActor: CommandDef<SpawnShape> = defineCommand('runtime.actor.spawn', {
  prefab: t.str,
  controllable: t.optional(t.bool),
})
export const MoveIntent: CommandDef<MoveShape> = defineCommand('runtime.actor.move', {
  x: t.f32,
  y: t.f32,
})
export const AttackTarget = defineCommand('runtime.combat.attack', {
  target: t.entity,
  ability: t.ref(AbilityDefContent),
  /** Optional explicit source actor; defaults to the inventory player. */
  source: t.optional(t.entity),
})
export const PickupItem: CommandDef<{ readonly ground: EntityType }> = defineCommand(
  'runtime.items.pickup',
  { ground: t.entity },
)
export const BuyItem: CommandDef<{ readonly vendor: RefType<'runtime.VendorDef'>; readonly slot: I32 }> = defineCommand(
  'runtime.commerce.buy',
  { vendor: t.ref(VendorDefContent), slot: t.i32 },
)
export const SellItem: CommandDef<{ readonly vendor: RefType<'runtime.VendorDef'>; readonly slot: I32 }> = defineCommand(
  'runtime.commerce.sell', { vendor: t.ref(VendorDefContent), slot: t.i32 },
)
export const EquipItem: CommandDef<{ readonly slot: I32 }> = defineCommand(
  'runtime.items.equip',
  { slot: t.i32 },
)
export const UseItem: CommandDef<{ readonly slot: I32 }> = defineCommand('runtime.items.use', { slot: t.i32 })
type QuestRef = { readonly quest: RefType<'runtime.QuestDef'> }
export const AcceptQuest: CommandDef<QuestRef> = defineCommand(
  'runtime.quest.accept',
  { quest: t.ref(QuestDefContent) },
)
export const TurnInQuest: CommandDef<QuestRef> = defineCommand(
  'runtime.quest.turnIn',
  { quest: t.ref(QuestDefContent) },
)
type DialogueRef = { readonly dialogue: RefType<'runtime.Dialogue'> }
export const DialogueStart: CommandDef<DialogueRef> = defineCommand(
  'runtime.dialogue.start',
  { dialogue: t.ref(DialogueContent) },
)
export const DialogueChoose: CommandDef<{ readonly choice: StringType }> = defineCommand(
  'runtime.dialogue.choose',
  { choice: t.str },
)
export const EncounterStart: CommandDef<{ readonly encounter: RefType<'runtime.EncounterDef'> }> = defineCommand(
  'runtime.encounter.start',
  { encounter: t.ref(EncounterDefContent) },
)
export const UsePortal: CommandDef<{ readonly portal: StringType }> = defineCommand(
  'runtime.zone.portal',
  { portal: t.str },
)
