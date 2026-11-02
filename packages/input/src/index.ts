import type { Input, KeyboardTarget } from './input.js'

export { InputActions } from './actions.js'
export type { ActionState, CommandRequest, InputMap } from './actions.js'
export { Input, createInput } from './input.js'
export type { InputOptions, KeyEventLike, KeyboardTarget } from './input.js'

export function attachKeyboard(input: Input, target: KeyboardTarget): () => void {
  input.attach(target)
  return () => input.detach()
}
