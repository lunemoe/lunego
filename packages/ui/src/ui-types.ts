export type UiNode = Node | Node[]
export type UiChild = Node | string | number | readonly UiChild[]
export type UiValue<T> = T | (() => T)

export function readValue<T>(value: UiValue<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value
}
