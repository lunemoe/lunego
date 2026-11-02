export {}
declare global {
  interface Window {
    __luneGame?: {
      readonly game: {
        readonly frame: { readonly tick: number }
        send(type: string, payload: unknown): Promise<unknown>
      }
      readonly vfx: { readonly effectCount: number }
    }
  }
}
