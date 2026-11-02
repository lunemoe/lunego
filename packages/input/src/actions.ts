export type InputMap = Readonly<Record<string, readonly string[]>>

export interface ActionState {
  isDown(action: string): boolean
  wasPressed(action: string): boolean
  wasReleased(action: string): boolean
  axis(negative: string, positive: string): number
  readonly active: readonly string[]
}

export interface CommandRequest {
  readonly type: string
  readonly payload: unknown
}

export class InputActions implements ActionState {
  private bindings: Record<string, readonly string[]> = {}
  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  private readonly released = new Set<string>()
  private readonly downByCode = new Map<string, string[]>()

  constructor(map: InputMap = {}) {
    this.loadMap(map)
  }

  get active(): readonly string[] {
    return [...this.down]
  }

  isDown(action: string): boolean {
    return this.down.has(action)
  }

  wasPressed(action: string): boolean {
    return this.pressed.has(action)
  }

  wasReleased(action: string): boolean {
    return this.released.has(action)
  }

  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0)
  }

  bind(action: string, codes: readonly string[]): void {
    if (action.length === 0) {
      throw new Error('action name must not be empty')
    }
    this.bindings = { ...this.bindings, [action]: [...codes] }
    this.rebuildLookup()
  }

  loadMap(map: InputMap): void {
    const next: Record<string, readonly string[]> = {}
    for (const action of Object.keys(map)) {
      if (action.length === 0) {
        throw new Error('action name must not be empty')
      }
      next[action] = [...map[action]]
    }
    this.bindings = next
    this.rebuildLookup()
  }

  serialize(): Record<string, readonly string[]> {
    const result: Record<string, readonly string[]> = {}
    for (const action of Object.keys(this.bindings)) {
      result[action] = [...this.bindings[action]]
    }
    return result
  }

  handleKeyDown(code: string): boolean {
    const actions = this.downByCode.get(code)
    if (actions === undefined) {
      return false
    }
    for (const action of actions) {
      if (!this.down.has(action)) {
        this.down.add(action)
        this.pressed.add(action)
      }
    }
    return true
  }

  handleKeyUp(code: string): boolean {
    const actions = this.downByCode.get(code)
    if (actions === undefined) {
      return false
    }
    for (const action of actions) {
      if (this.down.has(action)) {
        this.down.delete(action)
        this.released.add(action)
      }
    }
    return true
  }

  endFrame(): void {
    this.pressed.clear()
    this.released.clear()
  }

  private rebuildLookup(): void {
    this.downByCode.clear()
    for (const action of Object.keys(this.bindings)) {
      for (const code of this.bindings[action]) {
        const current = this.downByCode.get(code)
        if (current === undefined) {
          this.downByCode.set(code, [action])
        } else {
          current.push(action)
        }
      }
    }
  }
}
