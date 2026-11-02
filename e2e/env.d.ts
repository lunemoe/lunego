export {}
declare global {
  interface Window {
    __audioProbe?: {
      readonly state: string
      readonly voices: number
      readonly sampleRate: number
    }
    __luneGame?: {
      readonly game: {
        readonly frame: { readonly tick: number }
        send(type: string, payload: unknown): Promise<unknown>
      }
      readonly vfx: { readonly effectCount: number }
      readonly renderer: {
        readonly textures: { has(id: string): boolean }
        readonly tilemap: { readonly count: number } | null
        readonly worldContainer: { readonly scale: { readonly x: number } }
        setZoom(value: number): void
      }
      readonly audioProbe?: {
        readonly state: string
        readonly voices: number
        readonly sampleRate: number
      }
      readonly input: {
        readonly pointer: {
          readonly screenPosition: { readonly x: number; readonly y: number }
          readonly worldPosition: { readonly x: number; readonly y: number }
        }
      }
    }
  }
}
