import type { EventDef } from './definitions.js'

export interface EmittedEvent {
  readonly def: EventDef
  readonly payload: unknown
}
