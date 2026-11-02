export { LuneGoError, guardError, registrationError } from './errors.js'
export type { LuneGoErrorOptions, RuleId } from './errors.js'

export {
  added,
  defineCommand,
  defineComponent,
  defineCue,
  defineEvent,
  defineHandler,
  defineInvariant,
  defineModel,
  defineQuery,
  defineSystem,
  defineTag,
  ok,
  reject,
  removed,
  without,
} from './definitions.js'
export { defineFeature } from './features.js'
export { defineState } from './state-definitions.js'
export type {
  BaseContext,
  CommandDef,
  CommandOutcome,
  CommandPayload,
  ComponentDef,
  ComponentOptions,
  CueDef,
  CuePayload,
  EventDef,
  EventOptions,
  EventPayload,
  FeatureDef,
  FeatureDefinition,
  FeatureRegistry,
  FeatureSchema,
  FlowStateDef,
  FlowStateOptions,
  NormalizedFlowStateOptions,
  HandlerContext,
  HandlerDef,
  HandlerDefinition,
  InvariantContext,
  InvariantDef,
  ListenSpec,
  ModelDef,
  ModelOptions,
  NormalizedComponentOptions,
  NormalizedListenSpec,
  NormalizedModelOptions,
  Phase,
  QueryArg,
  QueryContext,
  QueryDef,
  QueryFilter,
  RunIfContext,
  StateDef,
  StateHookDef,
  StateHookDefinition,
  StateTransition,
  StructuralContext,
  SystemContext,
  SystemDef,
  SystemDefinition,
  TagDef,
  TimeService,
} from './definitions.js'

export type { LogEntry, LogLevel, LogService, MathService } from './context-types.js'
export { LOGIC_MATH } from './math-service.js'
export {
  cameraWorldOffset,
  screenToWorldPoint,
  worldToScreenPixel,
} from './viewport-math.js'
export type { CameraWorldOffset } from './viewport-math.js'
export { isNumericKind, t } from './schema.js'
export { cloneDeep, coerceValue } from './schema-coerce.js'
export type {
  AnyTypeDef,
  ArrayType,
  AssetType,
  ColumnOf,
  ComponentView,
  ConcreteTypeDef,
  ContentId,
  ContentTypeDef,
  DeepReadonly,
  Entity,
  EnumType,
  Infer,
  NumericScalarKind,
  OptionalType,
  PersistScope,
  RefType,
  ScalarKind,
  ScalarType,
  SchemaShape,
  SchemaValue,
  StructType,
  TextType,
  TypeKind,
  Vec2,
  Vec2Type,
} from './schema.js'

export { ContentRegistry, defineContentType, parseContentId } from './content.js'
export type { AssetPackMetadata } from './content.js'
export { createModelProxy, diffModel } from './model.js'
export type { ModelPatch } from './model.js'
export type { RngStateWords, RngStream } from './rng.js'
export { entityGeneration, entityIndex, NULL_ENTITY } from './ecs/entity-store.js'
export type { EntityTableSnapshot } from './ecs/entity-store.js'
export type { Diagnostic } from './scheduler.js'

export { SNAPSHOT_FORMAT_VERSION, World } from './world.js'
export type {
  CommandEnvelope,
  CommandSource,
  CueInstance,
  Frame,
  FrameEvent,
  RestoreOptions,
  SendOptions,
  SnapshotComponentEntry,
  SnapshotComponentState,
  SnapshotEvent,
  SnapshotRng,
  SnapshotScope,
  WorldOptions,
  WorldSnapshot,
} from './world.js'
