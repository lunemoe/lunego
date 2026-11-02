export type ActionContextName = 'gameplay' | 'menu' | 'dialogue' | 'cutscene'

/** Stack of input consumers; only gameplay feeds game commands. */
export class ActionContext {
  private readonly stack: ActionContextName[] = ['gameplay']
  private readonly listeners = new Set<() => void>()

  get current(): ActionContextName {
    return this.stack[this.stack.length - 1] ?? 'gameplay'
  }

  get isGameplay(): boolean {
    return this.current === 'gameplay'
  }

  push(context: ActionContextName): () => void {
    this.stack.push(context)
    this.notify()
    return () => this.pop(context)
  }

  pop(context?: ActionContextName): void {
    if (this.stack.length <= 1) {
      return
    }
    const top = this.stack[this.stack.length - 1]
    if (context !== undefined && top !== context) {
      return
    }
    this.stack.pop()
    this.notify()
  }

  replace(context: ActionContextName): void {
    this.stack[this.stack.length - 1] = context
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
