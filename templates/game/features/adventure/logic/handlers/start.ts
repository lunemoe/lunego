import { defineHandler, ok } from '@lunego/core'
import { ZoneStateModel } from '@lunego/kit-runtime'
import { CharacterProfile, RunProgress, Start } from '../../schema.js'

export default defineHandler(Start, {
  writes: [CharacterProfile, RunProgress, ZoneStateModel],
  run(ctx) {
    const profile = ctx.mutModel(CharacterProfile)
    profile.name = 'Knight'
    profile.level = 1
    profile.xp = 0
    profile.kills = 0
    ctx.mutModel(RunProgress).endedAt = 0
    ctx.mutModel(RunProgress).stage = 1
    ctx.mutModel(ZoneStateModel).snapshot = JSON.stringify({ zone: 'p9.zone' })
    return ok()
  },
})
