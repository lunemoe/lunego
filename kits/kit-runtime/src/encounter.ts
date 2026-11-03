import { defineSystem, type ComponentDef, type HandlerContext } from '@lunego/core'
import { EncounterRuntime, type SpawnedEntity } from '@lunego/kit-encounter'
import type { RuntimeContent } from './content.js'
import type { RuntimeFeatureOptions } from './types.js'
import { parseEncounterSave } from './state-bridge.js'
import {
  ActorSpawned, CombatDead, CombatHealth, Died,
  EncounterCompleted, EncounterMember, EncounterPhaseChanged, EncounterStateModel,
} from './schema.js'

export function spawnEncounterActors(
  ctx: HandlerContext, content: RuntimeContent, encounter: string, actors: readonly SpawnedEntity[],
): void {
  for (const spawned of actors) {
    const prefab = content.prefabs.get(spawned.contentId)
    if (prefab === undefined) throw new Error(`missing encounter prefab ${spawned.contentId}`)
    const entity = ctx.spawn(prefab, {
      'runtime.actor.position': { x: spawned.x, y: spawned.y },
      'runtime.content.tag': { contentId: spawned.contentId },
    })
    ctx.add(entity, EncounterMember, { encounter, wave: spawned.wave, spawnKey: spawned.entity })
    ctx.emit(ActorSpawned, { entity, prefab: spawned.contentId })
  }
}

export function encounterSystem(options: RuntimeFeatureOptions, components: readonly ComponentDef[]) {
  return defineSystem({
    name: `${options.name}.encounter.advance`, phase: 'post',
    reads: [EncounterMember, CombatHealth, CombatDead],
    writes: [EncounterStateModel, ...components],
    listens: [Died], emits: [ActorSpawned, EncounterPhaseChanged, EncounterCompleted],
    run(ctx) {
      const state = ctx.model(EncounterStateModel)
      const saved = parseEncounterSave(state.snapshot)
      if (saved === null || state.completed || state.spawnTick === ctx.tick) return
      const def = options.content.encounters.get(saved.encounter)
      if (def === undefined) throw new Error(`missing encounter ${saved.encounter}`)
      const wave = def.waves[saved.runtime.waveIndex]
      const members = ctx.read(EncounterMember)
      const alive = ctx.query(EncounterMember).some((entity) =>
        members.encounter[entity] === saved.encounter && members.wave[entity] === wave?.id &&
        !ctx.has(entity, CombatDead) && ctx.has(entity, CombatHealth) && ctx.read(CombatHealth).current[entity] > 0)
      if (alive) return
      if (saved.runtime.waveIndex + 1 >= def.waves.length) {
        ctx.mutModel(EncounterStateModel).completed = true
        ctx.emit(EncounterCompleted, { encounter: saved.encounter })
        return
      }
      if (state.nextWaveTick === 0) {
        ctx.mutModel(EncounterStateModel).nextWaveTick = ctx.tick + (options.waveDelayTicks ?? 0)
      }
      if (ctx.tick < ctx.model(EncounterStateModel).nextWaveTick) return
      const runtime = new EncounterRuntime({
        def, rng: ctx.rng('encounter'), spawnPoints: wave?.spawnPoints ?? [], state: saved.runtime,
      })
      const next = runtime.nextWave()
      if (!next.ok) throw new Error(`encounter ${def.id} cannot advance: ${next.reason}`)
      spawnEncounterActors(ctx, options.content, saved.encounter, next.spawned)
      const model = ctx.mutModel(EncounterStateModel)
      model.snapshot = JSON.stringify({ encounter: saved.encounter, runtime: runtime.serialize() })
      model.nextWaveTick = 0
      model.spawnTick = ctx.tick
      ctx.emit(EncounterPhaseChanged, { encounter: saved.encounter, phase: runtime.phase ?? '' })
    },
  })
}
