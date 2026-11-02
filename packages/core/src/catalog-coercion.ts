import type { ComponentDef, CueDef, EventDef, TagDef } from './definitions.js'
import { schemaError } from './errors.js'
import { coerceValue } from './schema-coerce.js'
import { t } from './schema.js'

export function coerceComponentValue(
  target: ComponentDef | TagDef,
  value: unknown,
): Record<string, unknown> {
  if (target.kind === 'tag') {
    if (value !== undefined && value !== true) {
      schemaError(target.name, 'tag value true')
    }
    return {}
  }
  return coerceValue(t.struct(target.schema), value, target.name)
}

export function coerceEventPayload(event: EventDef, payload: unknown): unknown {
  if (event.schema === null) {
    if (payload !== undefined) {
      schemaError(event.name, 'undefined payload')
    }
    return undefined
  }
  return coerceValue(t.struct(event.schema), payload, event.name)
}

export function coerceCuePayload(cue: CueDef, payload: unknown): unknown {
  return coerceValue(t.struct(cue.schema), payload, cue.name)
}
