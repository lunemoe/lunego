import type { CueDef, EventDef, HandlerContext, StateDef } from './definitions.js'
import { LuneGoError } from './errors.js'
import { definitionName } from './names.js'

export interface StateTransition<V extends string = string> {
  readonly from: V | null
  readonly to: V
  readonly tick: number
}

export interface StateHookDefinition<V extends string = string> {
  readonly reads?: readonly StateDef[]
  readonly writes?: readonly StateDef[]
  readonly emits?: readonly EventDef[]
  readonly cues?: readonly CueDef[]
  readonly run: (ctx: HandlerContext, transition: StateTransition<V>) => void
}

export interface StateHookDef<V extends string = string> {
  readonly reads: readonly StateDef[]
  readonly writes: readonly StateDef[]
  readonly emits: readonly EventDef[]
  readonly cues: readonly CueDef[]
  readonly run: (ctx: HandlerContext, transition: StateTransition<V>) => void
}

export interface FlowStateOptions<V extends string = string> {
  readonly initial: V
  readonly writers?: readonly string[]
  readonly onEnter?: Partial<Record<V, StateHookDefinition<V>>>
  readonly onExit?: Partial<Record<V, StateHookDefinition<V>>>
}

export interface NormalizedFlowStateOptions<V extends string = string> {
  readonly initial: V
  readonly writers: readonly string[]
  readonly onEnter: Partial<Record<V, StateHookDef<V>>>
  readonly onExit: Partial<Record<V, StateHookDef<V>>>
}

export interface FlowStateDef<V extends string = string> {
  readonly kind: 'state'
  readonly name: string
  readonly values: readonly V[]
  readonly options: NormalizedFlowStateOptions<V>
}

function normalizeStateHook<V extends string>(
  hook: StateHookDefinition<V> | undefined,
): StateHookDef<V> | undefined {
  if (hook === undefined) {
    return undefined
  }
  return {
    reads: [...(hook.reads ?? [])],
    writes: [...(hook.writes ?? [])],
    emits: [...(hook.emits ?? [])],
    cues: [...(hook.cues ?? [])],
    run: hook.run,
  }
}

export function defineState<const V extends string>(
  name: string,
  values: readonly V[],
  options: FlowStateOptions<V>,
): FlowStateDef<V> {
  if (values.length === 0) {
    throw new LuneGoError('definition_invalid', `state ${name} must declare at least one value`)
  }
  if (!values.includes(options.initial)) {
    throw new LuneGoError(
      'definition_invalid',
      `state ${name} initial value ${options.initial} is not declared`,
    )
  }
  const onEnter: Partial<Record<V, StateHookDef<V>>> = {}
  const onExit: Partial<Record<V, StateHookDef<V>>> = {}
  for (const value of values) {
    const enter = normalizeStateHook(options.onEnter?.[value])
    if (enter !== undefined) {
      onEnter[value] = enter
    }
    const exit = normalizeStateHook(options.onExit?.[value])
    if (exit !== undefined) {
      onExit[value] = exit
    }
  }
  return {
    kind: 'state',
    name: definitionName(name, 'state'),
    values: [...values],
    options: {
      initial: options.initial,
      writers: [...(options.writers ?? [])],
      onEnter,
      onExit,
    },
  }
}

