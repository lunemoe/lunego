import { defineHandler, ok, reject } from '@lunego/core'
import { CombatHealth, EncounterStateModel, InventoryState } from '@lunego/kit-runtime'
import { AdvanceRun, RunProgress } from '../../schema.js'
import { CycleWrites, resetEncounter } from '../run-cycle.js'

export default defineHandler(AdvanceRun, {
  reads: [InventoryState], writes: CycleWrites,
  run(ctx) {
    const player = ctx.query(InventoryState)[0]
    if (!ctx.model(EncounterStateModel).completed) return reject('not_completed')
    if (player === undefined || ctx.read(CombatHealth).current[player] <= 0) return reject('dead')
    ctx.mutModel(RunProgress).stage += 1
    resetEncounter(ctx, player)
    return ok()
  },
})
