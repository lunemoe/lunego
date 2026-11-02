import type { CommandDef, CommandOutcome } from './definitions.js'
import type { CommandQueue } from './commands.js'
import type { WorldCatalog } from './catalog.js'
import type { CommandEnvelope, SendOptions } from './world-types.js'
import { LuneGoError } from './errors.js'
import { coerceValue, deepFreeze } from './schema-coerce.js'
import { t } from './schema.js'

export interface SendState {
  readonly catalog: WorldCatalog
  readonly commands: CommandQueue
  readonly tick: number
  readonly stepping: boolean
  readonly failure: Error | null
}

export function sendCommand(
  state: SendState,
  command: CommandDef | string,
  payload: unknown,
  options: SendOptions = {},
): Promise<CommandOutcome> {
  if (state.stepping) {
    throw new LuneGoError('nested_command', 'commands cannot be sent from inside a tick', {
      rule: 'LG004',
    })
  }
  if (state.failure !== null) {
    throw state.failure
  }
  const def = state.catalog.resolveCommand(command)
  const source = options.source ?? 0
  if (typeof source === 'number') {
    if (!Number.isInteger(source) || source < 0) {
      throw new LuneGoError('command_invalid', 'command source must be a uint32')
    }
  } else if (source.length === 0) {
    throw new LuneGoError('command_invalid', 'command source channel must not be empty')
  }
  const targetTick = options.tick ?? state.tick + 1
  if (!Number.isInteger(targetTick) || targetTick <= state.tick) {
    throw new LuneGoError(
      'command_invalid',
      `command target tick ${targetTick} must be after the current tick ${state.tick}`,
    )
  }
  const coerced = coerceValue(t.struct(def.schema), payload, def.type)
  const envelope: CommandEnvelope = deepFreeze({
    tick: targetTick,
    seq: state.commands.nextSequence(),
    source,
    type: def.type,
    payload: coerced,
  })
  const { promise, resolve, reject } = Promise.withResolvers<CommandOutcome>()
  state.commands.enqueue(envelope, resolve, reject)
  return promise
}
