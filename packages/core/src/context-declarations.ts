import type { CueDef, EventDef, StateDef } from './definitions.js'

export interface ContextDeclarations {
  readonly reads: ReadonlySet<string>
  readonly writes: ReadonlySet<string>
  readonly emits: ReadonlySet<string>
  readonly cues: ReadonlySet<string>
  readonly listenSame: ReadonlySet<string>
  readonly listenPrev: ReadonlySet<string>
}

export function declarationsFrom(
  reads: readonly StateDef[],
  writes: readonly StateDef[],
  emits: readonly EventDef[],
  cues: readonly CueDef[],
  listens: ReadonlyArray<{ readonly event: EventDef; readonly prev: boolean }> = [],
): ContextDeclarations {
  const listenSame = new Set<string>()
  const listenPrev = new Set<string>()
  for (const listen of listens) {
    if (listen.prev) {
      listenPrev.add(listen.event.name)
    } else {
      listenSame.add(listen.event.name)
    }
  }
  return {
    reads: new Set(reads.map((def) => def.name)),
    writes: new Set(writes.map((def) => def.name)),
    emits: new Set(emits.map((def) => def.name)),
    cues: new Set(cues.map((def) => def.name)),
    listenSame,
    listenPrev,
  }
}
