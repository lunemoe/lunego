import type {
  CueDef,
  CuePayload,
  EventDef,
  EventPayload,
} from './definitions.js'
import type { ModelPatch } from './model.js'
import type { WorldCatalog } from './catalog.js'
import type { EmittedEvent } from './events.js'
import {
  emptyFrame,
  type CueInstance,
  type Frame,
} from './world-types.js'

export class EventState {
  private injected: EmittedEvent[] = []
  private current: EmittedEvent[] = []
  private previous: EmittedEvent[] = []
  private cues: CueInstance[] = []
  private cueSequence = 0
  private frameValue: Frame = emptyFrame(0)

  beginTick(): void {
    this.current = this.injected.slice()
    this.injected.length = 0
    this.cues.length = 0
    this.cueSequence = 0
  }

  queue<E extends EventDef>(
    event: E,
    payload: EventPayload<E>,
    catalog: WorldCatalog,
  ): void {
    catalog.assertEventRegistered(event)
    this.injected.push({
      def: event,
      payload: catalog.coerceEventPayload(event, payload),
    })
  }

  emit<E extends EventDef>(
    event: E,
    payload: EventPayload<E>,
    catalog: WorldCatalog,
  ): void {
    catalog.assertEventRegistered(event)
    this.current.push({
      def: event,
      payload: catalog.coerceEventPayload(event, payload),
    })
  }

  currentEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    return this.current
      .filter((entry) => entry.def === event)
      .map((entry) => entry.payload as EventPayload<E>)
  }

  previousEvents<E extends EventDef>(event: E): ReadonlyArray<EventPayload<E>> {
    return this.previous
      .filter((entry) => entry.def === event)
      .map((entry) => entry.payload as EventPayload<E>)
  }

  emitCue<C extends CueDef>(
    cue: C,
    payload: CuePayload<C>,
    source: string,
    tick: number,
    catalog: WorldCatalog,
  ): void {
    catalog.assertCueRegistered(cue)
    const sequence = this.cueSequence
    this.cueSequence += 1
    this.cues.push({
      id: `${tick}:${source}:${sequence}`,
      type: cue.name,
      tick,
      sequence,
      source,
      payload: catalog.coerceCuePayload(cue, payload),
    })
  }

  finish(tick: number, modelPatches: readonly ModelPatch[]): Frame {
    const frame: Frame = {
      tick,
      events: this.current.map((event) => ({
        type: event.def.name,
        tick,
        payload: event.payload,
      })),
      cues: [...this.cues],
      modelPatches,
    }
    this.previous = this.current
    this.current = []
    this.frameValue = frame
    return frame
  }

  get previousList(): readonly EmittedEvent[] {
    return this.previous
  }

  get frame(): Frame {
    return this.frameValue
  }

  restore(previous: readonly EmittedEvent[], tick: number): void {
    this.previous = [...previous]
    this.current = []
    this.injected.length = 0
    this.cues.length = 0
    this.cueSequence = 0
    this.frameValue = emptyFrame(tick)
  }

  clear(): void {
    this.previous = []
    this.current = []
    this.injected.length = 0
    this.cues.length = 0
    this.cueSequence = 0
    this.frameValue = emptyFrame(0)
  }
}
