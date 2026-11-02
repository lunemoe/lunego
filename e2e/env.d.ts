export {}
declare global {
  interface Window {
    __luneGame?: {
      readonly game: { readonly frame: { readonly tick: number } }
    }
  }
}
