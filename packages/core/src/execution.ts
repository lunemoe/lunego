import type { CommandDef, CommandOutcome, CommandPayload, QueryDef, SystemDef } from './definitions.js'
import { InvariantRuntimeContext, RunContext, RunIfRuntimeContext } from './context.js'
import { LuneGoError } from './errors.js'
import type { WorldCatalog } from './catalog.js'
import type { PendingCommand } from './commands.js'
import type { ContextHost } from './context-host.js'

function assertOutcome(outcome: CommandOutcome): void {
  if (outcome.status === 'ok') {
    return
  }
  if (outcome.status === 'rejected' && typeof outcome.reason === 'string') {
    return
  }
  throw new LuneGoError('invalid_result', 'handler returned an invalid command outcome')
}

export function executeCommands(
  world: ContextHost,
  catalog: WorldCatalog,
  pendingCommands: readonly PendingCommand[],
): void {
  for (const pending of pendingCommands) {
    const binding = catalog.handlerBindings.get(pending.envelope.type)
    if (binding === undefined) {
      throw new LuneGoError('command_invalid', `no handler for command ${pending.envelope.type}`)
    }
    const context = new RunContext(world, 'handler', pending.envelope.type, binding.declarations)
    context.activate()
    let outcome: CommandOutcome
    try {
      outcome = binding.def.run(
        context,
        pending.envelope.payload as CommandPayload<CommandDef>,
      )
    } finally {
      context.deactivate()
    }
    assertOutcome(outcome)
    pending.resolve(outcome)
  }
}

export function executeSystem(world: ContextHost, catalog: WorldCatalog, def: SystemDef): void {
  const binding = catalog.systemBindings.get(def)
  if (binding === undefined) {
    throw new LuneGoError('system_invalid', `system ${def.name} has no binding`)
  }
  if (binding.def.runIf !== null && !binding.def.runIf(new RunIfRuntimeContext(world))) {
    return
  }
  const context = new RunContext(world, 'system', def.name, binding.declarations)
  context.activate()
  try {
    binding.def.run(context)
  } finally {
    context.deactivate()
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
