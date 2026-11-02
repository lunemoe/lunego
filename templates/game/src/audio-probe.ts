import {
  createWebAudio,
  defineAudioCueMap,
} from '@lunego/audio'
import type { Frame } from '@lunego/core'

declare global {
  interface Window {
    __audioProbe?: {
      readonly state: string
      readonly voices: number
      readonly sampleRate: number
    }
  }
}

async function run(): Promise<void> {
  const { audio, sounds, context } = createWebAudio()
  const buffer = context.createBuffer(1, Math.max(1, Math.round(context.sampleRate * 0.1)), context.sampleRate)
  sounds.register('probe', buffer)
  await audio.unlock()
  const map = defineAudioCueMap({
    'probe.ping': () => [{ sound: 'probe' }],
  })
  const frame: Frame = {
    tick: 1,
    events: [],
    cues: [
      { id: 'probe:1', type: 'probe.ping', tick: 1, sequence: 0, source: 'probe', payload: undefined },
    ],
    modelPatches: [],
  }
  audio.consume(frame, map)
  window.__audioProbe = {
    state: context.state,
    voices: audio.voiceCount,
    sampleRate: context.sampleRate,
  }
}

document.querySelector<HTMLButtonElement>('#unlock')?.addEventListener('click', () => {
  void run()
})
