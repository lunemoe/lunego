import type { GameFrame } from '@lunego/host'
import { attachBrowserAudioUnlock, createWebAudio, MusicController, registerAssetSounds } from '@lunego/audio'
import { Assets, assetUrl } from '../assets.js'

export async function createP9Audio() {
  const { context, audio, sounds } = createWebAudio({ seed: 7, buses: { master: 0.65, sfx: 0.5, music: 0.15 } })
  const loaded = await registerAssetSounds(sounds, Assets, (file) => assetUrl({ file }))
  if (loaded.failed.length > 0) throw new Error(`p9 audio loading failed: ${loaded.failed.map((entry) => entry.id).join(', ')}`)
  attachBrowserAudioUnlock(audio)
  const music = new MusicController(audio, { volume: 0.15 })
  music.play('music_dungeon_loop')
  let muted = false
  let level = 1
  const present = (frame: GameFrame, player: number, nextLevel: number): void => {
    for (const [index, event] of frame.events.entries()) {
      const value = event.payload as { readonly source?: number; readonly target?: number; readonly ability?: string; readonly phase?: string }
      const sound = event.type === 'runtime.encounter.phase' && value.phase === 'Boss' ? 'sfx_boss_phase'
        : event.type === 'runtime.ability.used' ? 'sfx_slash'
        : event.type === 'runtime.combat.damaged' ? (value.target === player ? 'sfx_hurt' : 'sfx_hit')
        : event.type === 'runtime.combat.died' ? 'sfx_death'
        : event.type === 'runtime.items.picked' ? 'sfx_pickup'
        : event.type === 'runtime.items.dropped' ? 'sfx_loot_drop' : undefined
      if (sound !== undefined) audio.play({ sound, maxConcurrent: 4 }, `${frame.tick}:${index}`)
    }
    if (nextLevel > level) audio.play({ sound: 'sfx_levelup' }, `${frame.tick}:level`)
    level = nextLevel
  }
  return {
    present,
    clear: (): void => { audio.stopAll(); music.play('music_dungeon_loop'); level = 1 },
    setMuted: (value: boolean): void => { muted = value; audio.setMuted('master', value) },
    info: {
      get state() { return context.state },
      get loaded() { return sounds.size },
      get voices() { return audio.voiceCount },
      get musicPlaying() { return music.playing },
      get muted() { return muted },
    },
  }
}
