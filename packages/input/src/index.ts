import type { Input, KeyboardTarget } from './input.js'
import type { PointerTarget } from './pointer.js'

export { InputActions } from './actions.js'
export { ActionContext } from './context.js'
export type { ActionContextName } from './context.js'
export type { ActionState, CommandRequest, InputMap } from './actions.js'
export { Input, createInput } from './input.js'
export type { InputDevice } from './input.js'
export {
  GamepadSource,
  applyGamepadActions,
  gamepadConflicts,
  pollGamepads,
} from './gamepad.js'
export type {
  GamepadAxisBinding,
  GamepadBindings,
  GamepadButtonBinding,
  GamepadButtonLike,
  GamepadConflict,
  GamepadEvent,
  GamepadLike,
  GamepadOptions,
  GamepadPoll,
  GamepadProvider,
} from './gamepad.js'
export {
  KEYBIND_SETTINGS_VERSION,
  KeybindCapture,
  SettingsProfile,
  bindingConflict,
  createKeybindSettings,
  defineSettingsSchema,
  keybindConflicts,
  keybindSettingsSchema,
} from './settings.js'
export type {
  KeybindCaptureOptions,
  KeybindConflict,
  KeybindSettingsData,
  SettingsEnvelope,
  SettingsSchema,
  SettingsScope,
} from './settings.js'
export { attachBrowserGamepad, attachBrowserInput } from './browser.js'
export type { GamepadBrowserTarget } from './browser.js'
export type { BrowserInputTarget } from './browser.js'
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
