import { InputActions, type ActionState, type CommandRequest, type InputMap } from './actions.js'
import { ActionContext } from './context.js'
import { applyGamepadActions, type GamepadBindings, type GamepadSource } from './gamepad.js'
import { PointerState, type PointerEventLike, type PointerTarget } from './pointer.js'

export interface KeyEventLike {
  readonly code: string
  readonly repeat?: boolean
  preventDefault?: () => void
}

export interface KeyboardTarget {
  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void
  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyEventLike) => void): void
}

export type InputDevice = 'keyboard' | 'gamepad' | 'pointer'

export interface InputOptions {
  readonly map: InputMap
  readonly toCommands: (actions: ActionState, pointer: PointerState) => readonly CommandRequest[]
  readonly target?: KeyboardTarget
  readonly pointerTarget?: PointerTarget
  readonly context?: ActionContext
  readonly gamepad?: GamepadSource
  readonly gamepadBindings?: GamepadBindings
  readonly onDeviceChange?: (device: InputDevice) => void
  readonly preventDefault?: boolean
}

/**
 * Device -> abstract actions -> game-defined commands. The class itself has no
 * DOM dependency; attachKeyboard is the only browser-facing entry.
 */
export class Input {
  readonly actions: InputActions
  readonly pointer = new PointerState()
  readonly context: ActionContext
  private readonly toCommands: InputOptions['toCommands']
  private readonly preventDefault: boolean
  private target: KeyboardTarget | null = null
  private pointerTarget: PointerTarget | null = null
  readonly gamepad: GamepadSource | undefined
  private gamepadBindings: GamepadBindings | undefined
  private readonly onDeviceChange: ((device: InputDevice) => void) | undefined
  private deviceValue: InputDevice = 'keyboard'
  private readonly onKeyDown = (event: KeyEventLike): void => {
    this.markDevice('keyboard')
    if (this.actions.handleKeyDown(event.code) && this.preventDefault) {
      event.preventDefault?.()
    }
  }

  private readonly onKeyUp = (event: KeyEventLike): void => {
    if (this.actions.handleKeyUp(event.code) && this.preventDefault) {
      event.preventDefault?.()
    }
  }

  private readonly onPointerDown = (event: PointerEventLike): void => {
    this.markDevice('pointer')
    this.pointer.handleDown(event)
    if (this.preventDefault) {
      event.preventDefault?.()
    }
  }

  private readonly onPointerMove = (event: PointerEventLike): void => {
    this.pointer.handleMove(event)
  }

  private readonly onPointerUp = (event: PointerEventLike): void => {
    this.pointer.handleUp(event)
  }

  private readonly onPointerCancel = (event: PointerEventLike): void => {
    this.pointer.handleCancel(event)
  }

  private readonly onContextMenu = (event: PointerEventLike): void => {
    if (this.preventDefault) {
      event.preventDefault?.()
    }
  }

  constructor(actions: InputActions, options: Omit<InputOptions, 'map'>) {
    this.actions = actions
    this.context = options.context ?? new ActionContext()
    this.gamepad = options.gamepad
    this.gamepadBindings = options.gamepadBindings
    this.onDeviceChange = options.onDeviceChange
    this.toCommands = options.toCommands
    this.preventDefault = options.preventDefault ?? true
    if (options.target !== undefined) {
      this.attach(options.target)
    }
    if (options.pointerTarget !== undefined) {
      this.attachPointer(options.pointerTarget)
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

  attachPointer(target: PointerTarget): void {
    this.detachPointer()
    target.addEventListener('pointerdown', this.onPointerDown)
    target.addEventListener('pointermove', this.onPointerMove)
    target.addEventListener('pointerup', this.onPointerUp)
    target.addEventListener('pointercancel', this.onPointerCancel)
    target.addEventListener('contextmenu', this.onContextMenu)
    this.pointerTarget = target
  }

  detachPointer(): void {
    if (this.pointerTarget === null) {
      return
    }
    this.pointerTarget.removeEventListener('pointerdown', this.onPointerDown)
    this.pointerTarget.removeEventListener('pointermove', this.onPointerMove)
    this.pointerTarget.removeEventListener('pointerup', this.onPointerUp)
    this.pointerTarget.removeEventListener('pointercancel', this.onPointerCancel)
    this.pointerTarget.removeEventListener('contextmenu', this.onContextMenu)
    this.pointerTarget = null
  }

  get device(): InputDevice {
    return this.deviceValue
  }

  get bindings(): GamepadBindings | undefined {
    return this.gamepadBindings
  }

  setGamepadBindings(bindings: GamepadBindings | undefined): void {
    this.gamepadBindings = bindings
  }

  poll(): readonly CommandRequest[] {
    if (this.gamepad !== undefined) {
      const poll = this.gamepad.poll()
      if (poll.active) {
        this.markDevice('gamepad')
      }
      // A disconnected pad must not release keyboard-held actions: its axes
      // read as zero, which would otherwise cancel every mapped movement action.
      if (this.gamepadBindings !== undefined && (poll.connected || poll.active)) {
        applyGamepadActions(this.actions, poll, this.gamepadBindings)
      }
    }
    const commands = this.context.isGameplay
      ? this.toCommands(this.actions, this.pointer)
      : []
    this.actions.endFrame()
    this.pointer.endFrame()
    return commands
  }

  private markDevice(device: InputDevice): void {
    if (this.deviceValue === device) {
      return
    }
    this.deviceValue = device
    this.onDeviceChange?.(device)
  }

  releaseAll(): void {
    this.actions.releaseAll()
    this.pointer.releaseAll()
  }

  rebind(action: string, codes: readonly string[]): void {
    this.actions.bind(action, codes)
  }

  loadMap(map: InputMap): void {
    this.actions.loadMap(map)
  }

  applySettings(settings: { readonly bindings: InputMap; readonly gamepad?: GamepadBindings }): void {
    this.actions.loadMap(settings.bindings)
    this.gamepadBindings = settings.gamepad
  }
}

export function createInput(options: InputOptions): Input {
  const { map, ...rest } = options
  return new Input(new InputActions(map), rest)
}

export type { InputActions, InputMap }
