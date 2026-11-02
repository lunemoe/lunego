import { InputActions, type ActionState, type CommandRequest, type InputMap } from './actions.js'

export interface KeyEventLike {
  readonly code: string
  readonly repeat?: boolean
  preventDefault?: () => void
}

export interface KeyboardTarget {
  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void
  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void
}

export interface InputOptions {
  readonly map: InputMap
  readonly toCommands: (actions: ActionState) => readonly CommandRequest[]
  readonly target?: KeyboardTarget
  readonly preventDefault?: boolean
}

/**
 * Device -> abstract actions -> game-defined commands. The class itself has no
 * DOM dependency; attachKeyboard is the only browser-facing entry.
 */
export class Input {
  readonly actions: InputActions
  private readonly toCommands: InputOptions['toCommands']
  private readonly preventDefault: boolean
  private target: KeyboardTarget | null = null
  private readonly onKeyDown = (event: KeyEventLike): void => {
    if (this.actions.handleKeyDown(event.code) && this.preventDefault) {
      event.preventDefault?.()
    }
  }

  private readonly onKeyUp = (event: KeyEventLike): void => {
    if (this.actions.handleKeyUp(event.code) && this.preventDefault) {
      event.preventDefault?.()
    }
  }

  constructor(actions: InputActions, options: Omit<InputOptions, 'map'>) {
    this.actions = actions
    this.toCommands = options.toCommands
    this.preventDefault = options.preventDefault ?? true
    if (options.target !== undefined) {
      this.attach(options.target)
    }
  }

  attach(target: KeyboardTarget): void {
    this.detach()
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
    this.target = target
  }

  detach(): void {
    if (this.target === null) {
      return
    }
    this.target.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('keyup', this.onKeyUp)
    this.target = null
  }

  poll(): readonly CommandRequest[] {
    const commands = this.toCommands(this.actions)
    this.actions.endFrame()
    return commands
  }

  rebind(action: string, codes: readonly string[]): void {
    this.actions.bind(action, codes)
  }

  loadMap(map: InputMap): void {
    this.actions.loadMap(map)
  }
}

export function createInput(options: InputOptions): Input {
  const { map, ...rest } = options
  return new Input(new InputActions(map), rest)
}

export type { InputActions, InputMap }
