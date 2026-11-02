import { render } from 'solid-js/web'
import type { UiBridge } from './bridge.js'
import type { UiNode } from './components.js'
import { installUiStyles } from './theme.js'

export type UiView = (bridge: UiBridge) => UiNode

export interface MountedUi {
  dispose(): void
}

/** Mount a Solid view into a DOM root; styles are installed once. */
export function mountUi(root: Element, bridge: UiBridge, view: UiView): MountedUi {
  const disposeStyles = installUiStyles(root.ownerDocument)
  const disposeRender = render(() => view(bridge), root)
  return {
    dispose: () => {
      disposeRender()
      disposeStyles()
      bridge.dispose()
    },
  }
}
