import type { Input, KeyboardTarget } from './input.js'
import type { PointerTarget } from './pointer.js'

export { InputActions } from './actions.js'
export type { ActionState, CommandRequest, InputMap } from './actions.js'
export { Input, createInput } from './input.js'
export type { InputOptions, KeyEventLike, KeyboardTarget } from './input.js'
export { PointerState } from './pointer.js'
export type {
  PointerEventLike,
  PointerPosition,
  PointerTarget,
  ViewportTransform,
} from './pointer.js'

export function attachPointer(input: Input, target: PointerTarget): () => void {
  input.attachPointer(target)
  return () => input.detachPointer()
}

export function attachKeyboard(input: Input, target: KeyboardTarget): () => void {
  input.attach(target)
  return () => input.detach()
}
