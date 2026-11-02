import { defineHandler, ok } from '@lunego/core'
import { CharacterProfile, Start } from '../../schema.js'

export default defineHandler(Start, {
  writes: [CharacterProfile],
  run(ctx) {
    const profile = ctx.mutModel(CharacterProfile)
    profile.name = 'Demo'
    profile.level = 1
    return ok()
  },
})
