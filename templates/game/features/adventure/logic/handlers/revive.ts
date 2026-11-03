import { defineHandler, ok, reject } from '@lunego/core'
import { CombatDead, CombatHealth, InventoryState, WalletState } from '@lunego/kit-runtime'
import { Revive } from '../../schema.js'
import { CycleWrites, resetEncounter } from '../run-cycle.js'

export default defineHandler(Revive, {
  reads: [InventoryState], writes: [...CycleWrites, WalletState],
  run(ctx) {
    const player = ctx.query(InventoryState)[0]
    if (player === undefined || ctx.read(CombatHealth).current[player] > 0) return reject('not_dead')
    ctx.remove(player, CombatDead)
    ctx.write(WalletState).gold[player] = Math.floor(ctx.read(WalletState).gold[player] * 0.8)
    resetEncounter(ctx, player)
    return ok()
  },
})
