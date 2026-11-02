export {}
declare global {
  interface Window {
    __pixiProbe?: {
      readonly connected: boolean
    }
    __audioProbe?: {
      readonly state: string
      readonly voices: number
      readonly sampleRate: number
    }
    __luneGame?: {
      readonly game: {
        readonly frame: { readonly tick: number; readonly hash: string }
        send(type: string, payload: unknown): Promise<unknown>
      }
      readonly vfx: { readonly effectCount: number }
      readonly renderer: {
        readonly textures: { has(id: string): boolean }
        readonly tilemap: { readonly count: number } | null
        readonly worldContainer: {
          readonly scale: { readonly x: number }
          readonly position: { readonly x: number; readonly y: number }
        }
        readonly viewport: {
          readonly cssScale: number
          readonly offsetX: number
          readonly offsetY: number
          readonly cameraX: number
          readonly cameraY: number
          readonly camera: { readonly x: number; readonly y: number }
          readonly zoom: number
          readonly pixelSnap: boolean
          worldToScreen(x: number, y: number): { readonly x: number; readonly y: number }
          screenToWorld(x: number, y: number): { readonly x: number; readonly y: number }
        }
        setZoom(value: number): void
      }
      readonly audioProbe?: {
        readonly state: string
        readonly voices: number
        readonly sampleRate: number
        readonly musicPlaying: boolean
        readonly musicVolume: number
        readonly musicMuted: boolean
        readonly musicStopped: boolean
      }
      readonly gamepad: {
        readonly connected: boolean
      }
      readonly pendingCommands: () => number
      readonly hud: () => {
        readonly player: number
        readonly hp: number
        readonly maxHp: number
        readonly gold: number
        readonly inventory: readonly { readonly slot: number; readonly contentId: string; readonly quantity: number }[]
        readonly quests: readonly { readonly id: string; readonly status: string; readonly progress: number }[]
        readonly enemy: number
        readonly ground: number
      } | null
      readonly input: {
        readonly pointer: {
          readonly screenPosition: { readonly x: number; readonly y: number }
          readonly worldPosition: { readonly x: number; readonly y: number }
        }
      }
    }
  }
}
