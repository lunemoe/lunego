import type { InputActions } from './actions.js'

export interface GamepadButtonLike {
  readonly pressed: boolean
  readonly value?: number
}

export interface GamepadLike {
  readonly index: number
  readonly id: string
  readonly connected?: boolean
  readonly buttons: readonly GamepadButtonLike[]
  readonly axes: readonly number[]
}

export type GamepadProvider = () => readonly (GamepadLike | null)[]

export interface GamepadEvent {
  readonly type: 'connected' | 'disconnected'
  readonly index: number
  readonly id: string
}

export interface GamepadOptions {
  readonly provider?: GamepadProvider
  readonly playerIndex?: number
  readonly deadzone?: number
  readonly invertAxes?: readonly number[]
  /** Buttons that emit repeat events while held. */
  readonly repeatButtons?: readonly number[]
  /** Repeat interval in polls; default 1 when repeatButtons is non-empty. */
  readonly repeatEveryPolls?: number
}

export interface GamepadPoll {
  readonly connected: boolean
  readonly index: number
  readonly id: string | null
  readonly pressed: readonly number[]
  readonly released: readonly number[]
  readonly repeats: readonly number[]
  readonly held: readonly number[]
  readonly axes: readonly number[]
  readonly events: readonly GamepadEvent[]
  /** True when any button/axis state or connection changed. */
  readonly active: boolean
}

export interface GamepadButtonBinding {
  readonly action: string
  readonly button: number
  readonly repeatEveryPolls?: number
}

export interface GamepadAxisBinding {
  readonly action: string
  readonly axis: number
  /** 1 = positive axis, -1 = negative axis. */
  readonly direction: 1 | -1
  readonly threshold?: number
}

export interface GamepadBindings {
  readonly buttons: readonly GamepadButtonBinding[]
  readonly axes: readonly GamepadAxisBinding[]
}

export interface GamepadConflict {
  readonly device: 'button' | 'axis'
  readonly index: number
  readonly actions: readonly string[]
}

function defaultProvider(): readonly (GamepadLike | null)[] {
  const global = globalThis as {
    readonly navigator?: { getGamepads?: () => readonly (GamepadLike | null)[] }
  }
  return global.navigator?.getGamepads?.() ?? []
}

export function pollGamepads(provider: GamepadProvider = defaultProvider): readonly GamepadLike[] {
  return provider().filter((gamepad): gamepad is GamepadLike =>
    gamepad !== null && gamepad.connected !== false,
  )
}

/** Injected/fakeable gamepad source with deadzone, inversion and hotplug state. */
export class GamepadSource {
  private readonly provider: GamepadProvider
  private readonly manual = new Map<number, GamepadLike>()
  private playerIndexValue: number
  private readonly deadzone: number
  private readonly inverted: ReadonlySet<number>
  private readonly repeatButtons: ReadonlySet<number>
  private readonly repeatEvery: number
  private previousButtons: boolean[] = []
  private previousAxes: number[] = []
  private heldPolls: number[] = []
  private connectedValue: GamepadLike | null = null
  private pollCount = 0

  constructor(options: GamepadOptions = {}) {
    this.provider = options.provider ?? defaultProvider
    this.playerIndexValue = options.playerIndex ?? 0
    this.deadzone = options.deadzone ?? 0.2
    if (!Number.isFinite(this.deadzone) || this.deadzone < 0 || this.deadzone > 1) {
      throw new Error('gamepad deadzone must be within [0, 1]')
    }
    this.inverted = new Set(options.invertAxes ?? [])
    this.repeatButtons = new Set(options.repeatButtons ?? [])
    this.repeatEvery = options.repeatEveryPolls ?? 1
  }

  get playerIndex(): number {
    return this.playerIndexValue
  }

  get connected(): boolean {
    return this.connectedValue !== null
  }

  selectPlayer(index: number): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('gamepad player index must be a non-negative integer')
    }
    this.playerIndexValue = index
    this.connectedValue = null
    this.previousButtons = []
    this.previousAxes = []
  }

  availablePlayers(): readonly { readonly index: number; readonly id: string }[] {
    const all = [...this.provider(), ...this.manual.values()]
      .filter((gamepad): gamepad is GamepadLike => gamepad !== null && gamepad.connected !== false)
    const unique = new Map<number, string>()
    for (const gamepad of all) {
      unique.set(gamepad.index, gamepad.id)
    }
    return [...unique.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, id]) => ({ index, id }))
  }

  setGamepad(gamepad: GamepadLike): void {
    this.manual.set(gamepad.index, gamepad)
  }

  removeGamepad(index: number): void {
    this.manual.delete(index)
    if (this.connectedValue?.index === index) {
      this.connectedValue = null
    }
  }

  poll(): GamepadPoll {
    this.pollCount += 1
    const events: GamepadEvent[] = []
    const all = [...this.provider(), ...this.manual.values()]
      .filter((gamepad): gamepad is GamepadLike => gamepad !== null && gamepad.connected !== false)
    const gamepad = all.find((entry) => entry.index === this.playerIndexValue) ??
      all.find((entry) => entry.index === 0) ??
      all[0] ??
      null
    if (this.connectedValue === null && gamepad !== null) {
      events.push({ type: 'connected', index: gamepad.index, id: gamepad.id })
    } else if (this.connectedValue !== null && gamepad === null) {
      events.push({ type: 'disconnected', index: this.connectedValue.index, id: this.connectedValue.id })
    } else if (this.connectedValue !== null && gamepad !== null && this.connectedValue.id !== gamepad.id) {
      events.push({ type: 'disconnected', index: this.connectedValue.index, id: this.connectedValue.id })
      events.push({ type: 'connected', index: gamepad.index, id: gamepad.id })
    }
    this.connectedValue = gamepad
    if (gamepad === null) {
      const released = this.previousButtons.flatMap((pressed, index) => pressed ? [index] : [])
      this.previousButtons = []
      this.previousAxes = []
      return {
        connected: false,
        index: this.playerIndexValue,
        id: null,
        pressed: [],
        released,
        repeats: [],
        held: [],
        axes: [],
        events,
        active: events.length > 0 || released.length > 0,
      }
    }
    const buttons = gamepad.buttons.map((button) =>
      button.pressed || (button.value ?? 0) >= 0.5,
    )
    const pressed: number[] = []
    const released: number[] = []
    const repeats: number[] = []
    const held: number[] = []
    for (let index = 0; index < buttons.length; index += 1) {
      const now = buttons[index] === true
      const before = this.previousButtons[index] === true
      if (now) {
        held.push(index)
      }
      if (now && !before) {
        pressed.push(index)
        this.heldPolls[index] = 0
      } else if (!now && before) {
        released.push(index)
        this.heldPolls[index] = 0
      } else if (now && this.repeatButtons.has(index)) {
        this.heldPolls[index] = (this.heldPolls[index] ?? 0) + 1
        const interval = this.repeatEvery
        if (interval > 0 && (this.heldPolls[index] ?? 0) % interval === 0) {
          repeats.push(index)
        }
      }
    }
    const axes = gamepad.axes.map((value, index) => {
      const magnitude = Math.abs(value) <= this.deadzone ? 0 : Math.abs(value)
      const signed = this.inverted.has(index) ? -magnitude : magnitude
      return Math.sign(value) * signed
    })
    const axisChanged = axes.some((value, index) => value !== this.previousAxes[index])
    this.previousButtons = buttons
    this.previousAxes = axes
    return {
      connected: true,
      index: gamepad.index,
      id: gamepad.id,
      pressed,
      released,
      repeats,
      held,
      axes,
      events,
      active: events.length > 0 || pressed.length > 0 || released.length > 0 || axisChanged,
    }
  }
}

/** Applies gamepad bindings to existing actions; edges are supplied by poll(). */
export function applyGamepadActions(
  actions: InputActions,
  poll: GamepadPoll,
  bindings: GamepadBindings,
): void {
  for (const binding of bindings.buttons) {
    if (poll.pressed.includes(binding.button)) {
      actions.setAction(binding.action, true)
    } else if (poll.released.includes(binding.button)) {
      actions.setAction(binding.action, false)
    }
  }
  const desired = new Map<string, boolean>()
  for (const binding of bindings.axes) {
    const value = poll.axes[binding.axis] ?? 0
    const threshold = binding.threshold ?? 0.5
    const pressed = value * binding.direction >= threshold
    if (pressed) {
      desired.set(binding.action, true)
    } else if (!desired.has(binding.action)) {
      desired.set(binding.action, false)
    }
  }
  for (const [action, pressed] of desired) {
    actions.setAction(action, pressed)
  }
}

export function gamepadConflicts(bindings: GamepadBindings): readonly GamepadConflict[] {
  const buttons = new Map<number, string[]>()
  for (const binding of bindings.buttons) {
    const actions = buttons.get(binding.button) ?? []
    if (!actions.includes(binding.action)) {
      actions.push(binding.action)
    }
    buttons.set(binding.button, actions)
  }
  const axes = new Map<number, string[]>()
  for (const binding of bindings.axes) {
    const actions = axes.get(binding.axis) ?? []
    if (!actions.includes(binding.action)) {
      actions.push(binding.action)
    }
    axes.set(binding.axis, actions)
  }
  return [
    ...[...buttons.entries()]
      .filter(([, actions]) => actions.length > 1)
      .map(([index, actions]) => ({ device: 'button' as const, index, actions })),
    ...[...axes.entries()]
      .filter(([, actions]) => actions.length > 1)
      .map(([index, actions]) => ({ device: 'axis' as const, index, actions })),
  ]
}
