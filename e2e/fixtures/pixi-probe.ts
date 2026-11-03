import { createPixiRenderer } from '@lunego/render-pixi'

type Renderer = Awaited<ReturnType<typeof createPixiRenderer>>

declare global {
  interface Window {
    __pixiProbe?: {
      readonly connected: boolean
    }
  }
}

class Probe {
  private renderer: Renderer | null = null
  private host: HTMLElement | null = null

  async create(): Promise<void> {
    const host = document.createElement('div')
    host.id = 'pixi-probe'
    host.style.position = 'fixed'
    host.style.left = '-1000px'
    host.style.top = '0'
    host.style.width = '64px'
    host.style.height = '64px'
    document.body.appendChild(host)
    this.host = host
    this.renderer = await createPixiRenderer({ width: 64, height: 64, container: host })
    window.__pixiProbe = { connected: this.renderer.element.isConnected }
  }

  dispose(): void {
    const canvas = this.renderer?.element ?? null
    this.renderer?.dispose()
    this.renderer?.dispose()
    window.__pixiProbe = { connected: canvas?.isConnected ?? false }
    this.host?.remove()
    this.host = null
    this.renderer = null
  }
}

const probe = new Probe()

export function createProbe(): Promise<void> {
  return probe.create()
}

export function disposeProbe(): void {
  probe.dispose()
}
