import { render } from 'solid-js/web'
import type { UiBridge } from './bridge.js'
import type { UiNode } from './ui-types.js'
import { installUiStyles } from './theme.js'

export type UiView = (bridge: UiBridge) => UiNode

export interface MountedUi {
  dispose(): void
}

/** Mount a Solid view into a DOM root; styles are installed once. */
export function mountUi(root: Element | string, bridge: UiBridge, view: UiView): MountedUi {
  const element = typeof root === 'string'
    ? (typeof document === 'undefined' ? null : document.querySelector(root))
    : root
  if (element === null) {
    throw new Error(`UI mount root ${String(root)} was not found`)
  }
  const disposeStyles = installUiStyles(element.ownerDocument)
  const disposeRender = render(() => view(bridge) as Node, element)
  return {
    dispose: () => {
      disposeRender()
      disposeStyles()
      bridge.dispose()
    },
  }
}
