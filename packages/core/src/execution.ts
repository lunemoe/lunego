import type {
  CommandDef,
  CommandOutcome,
  CommandPayload,
  FlowStateDef,
  QueryDef,
  StateHookDef,
  StateTransition,
  SystemDef,
} from './definitions.js'
import { InvariantRuntimeContext, RunContext, RunIfRuntimeContext } from './context.js'
import { LuneGoError } from './errors.js'
import type { WorldCatalog } from './catalog.js'
import type { PendingCommand } from './commands.js'
import type { ContextHost } from './context-host.js'
import { flowStateRuntime } from './flow-state-registry.js'

function assertOutcome(outcome: CommandOutcome): void {
  if (outcome.status === 'ok') {
    return
  }
  if (outcome.status === 'rejected' && typeof outcome.reason === 'string') {
    return
  }
  throw new LuneGoError('invalid_result', 'handler returned an invalid command outcome')
}

function contextualize(error: unknown, label: string, tick: number): LuneGoError {
  if (error instanceof LuneGoError) {
    return error
  }
  const message = error instanceof Error ? error.message : String(error)
  return new LuneGoError(
    'runtime_failure',
    `${label} failed at tick ${tick}: ${message}`,
    { cause: error },
  )
}

export function executeCommands(
  world: ContextHost,
  catalog: WorldCatalog,
  pendingCommands: readonly PendingCommand[],
): void {
  for (let index = 0; index < pendingCommands.length; index += 1) {
    const pending = pendingCommands[index]
    const binding = catalog.handlerBindings.get(pending.envelope.type)
    if (binding === undefined) {
      const error = new LuneGoError(
        'command_invalid',
        `no handler for command ${pending.envelope.type}`,
      )
      for (let rest = index; rest < pendingCommands.length; rest += 1) {
        pendingCommands[rest].reject(error)
      }
      throw error
    }
    const context = new RunContext(world, 'handler', pending.envelope.type, binding.declarations)
    context.activate()
    try {
      const outcome = binding.def.run(
        context,
        pending.envelope.payload as CommandPayload<CommandDef>,
      )
      assertOutcome(outcome)
      pending.resolve(outcome)
    } catch (error) {
      const wrapped = contextualize(error, `handler ${pending.envelope.type}`, world.tick)
      for (let rest = index; rest < pendingCommands.length; rest += 1) {
        pendingCommands[rest].reject(wrapped)
      }
      throw wrapped
    } finally {
      context.deactivate()
    }
  }
}

export function executeSystem(world: ContextHost, catalog: WorldCatalog, def: SystemDef): void {
  const binding = catalog.systemBindings.get(def)
  if (binding === undefined) {
    throw new LuneGoError('system_invalid', `system ${def.name} has no binding`)
  }
  if (binding.def.runIf !== null && !binding.def.runIf(new RunIfRuntimeContext(world, binding.declarations, def.name))) {
    return
  }
  const context = new RunContext(world, 'system', def.name, binding.declarations)
  context.activate()
  try {
    binding.def.run(context)
  } catch (error) {
    throw contextualize(error, `system ${def.name}`, world.tick)
  } finally {
    context.deactivate()
  }
}

export function executeStateHook(
  world: ContextHost,
  catalog: WorldCatalog,
  hook: StateHookDef,
  transition: StateTransition,
): void {
  const binding = catalog.stateHookBindings.get(hook)
  if (binding === undefined) {
    throw new LuneGoError('system_invalid', 'state hook has no binding')
  }
  const context = new RunContext(
    world,
    'handler',
    `state ${String(transition.to)}`,
    binding.declarations,
  )
  context.activate()
  try {
    hook.run(context, transition)
  } catch (error) {
    throw contextualize(error, `state hook ${String(transition.to)}`, world.tick)
  } finally {
    context.deactivate()
  }
}

export interface PendingStateTransition {
  readonly def: FlowStateDef
  readonly to: string
}

export function applyStateTransitions(
  world: ContextHost,
  catalog: WorldCatalog,
  pending: readonly PendingStateTransition[],
): void {
  let remaining = [...pending]
  let processed = 0
  while (remaining.length > 0) {
    processed += 1
    if (processed > 32) {
      throw new LuneGoError('state_transition_loop', 'state transitions did not settle within 32 steps')
    }
    const next = remaining
    remaining = []
    for (const transition of next) {
      const runtime = flowStateRuntime(catalog, transition.def)
      const from = runtime.current
      if (from === transition.to) {
        continue
      }
      const exit = transition.def.options.onExit[from]
      if (exit !== undefined) {
        executeStateHook(world, catalog, exit, {
          from,
          to: transition.to,
          tick: world.tick,
        })
      }
      runtime.current = transition.to
      const enter = transition.def.options.onEnter[transition.to]
      if (enter !== undefined) {
        executeStateHook(world, catalog, enter, {
          from,
          to: transition.to,
          tick: world.tick,
        })
      }
    }
  }
}

export function checkInvariants(world: ContextHost, catalog: WorldCatalog): void {
  const context = new InvariantRuntimeContext(world)
  for (const invariant of catalog.invariantBindings) {
    const message = invariant.def.check(context)
    if (message !== null) {
      throw new LuneGoError(
        'invariant_failed',
        `invariant ${invariant.feature}/${invariant.def.name} failed: ${message}`,
        { rule: 'LG003' },
      )
    }
  }
}

export interface QueryDepthState {
  depth: number
}

export function executeQuery<Args, Result>(
  world: ContextHost,
  catalog: WorldCatalog,
  state: QueryDepthState,
  query: QueryDef<Args, Result>,
  args: Args,
): Result {
  const binding = catalog.queries.get(query.name)
  if (binding === undefined || binding.def !== query) {
    throw new LuneGoError('query_invalid', `query ${query.name} is not registered`)
  }
  if (state.depth >= 32) {
    throw new LuneGoError('query_depth', 'query call depth exceeded')
  }
  state.depth += 1
  const context = new RunContext(world, 'query', query.name, binding.declarations)
  context.activate()
  try {
    return query.run(context, args)
  } finally {
    context.deactivate()
    state.depth -= 1
  }
}
