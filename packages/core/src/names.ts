import { LuneGoError } from './errors.js'

export function definitionName(name: string, kind: string): string {
  if (name.length === 0 || name.trim() !== name) {
    throw new LuneGoError('definition_invalid', `${kind} name must not be empty`)
  }
  if (/\s/.test(name)) {
    throw new LuneGoError('definition_invalid', `${kind} name must not contain whitespace`)
  }
  return name
}
