export type RuleId =
  | 'LG001'
  | 'LG002'
  | 'LG003'
  | 'LG004'
  | 'LG005'
  | 'LG006'
  | 'LG007'
  | 'LG008'
  | 'LG009'
  | 'LG010'
  | 'LG011'
  | 'LG012'
  | 'LG013'
  | 'LG014'
  | 'LG015'

export interface LuneGoErrorOptions {
  readonly rule?: RuleId
  readonly cause?: unknown
}

/**
 * All framework errors carry a stable machine code. Guard failures also carry
 * the rule id so the message can point at docs/rules/LGxxx.md.
 */
export class LuneGoError extends Error {
  readonly code: string
  readonly rule: RuleId | null

  constructor(code: string, message: string, options: LuneGoErrorOptions = {}) {
    super(message)
    this.name = 'LuneGoError'
    this.code = code
    this.rule = options.rule ?? null
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

export function guardError(rule: RuleId, message: string): LuneGoError {
  return new LuneGoError('guard_violation', message, { rule })
}

export function registrationError(message: string, rule?: RuleId): LuneGoError {
  return new LuneGoError('registration', message, rule === undefined ? {} : { rule })
}

export function schemaError(path: string, expected: string): never {
  throw new LuneGoError(
    'schema_invalid',
    `schema mismatch at ${path}: expected ${expected}`,
    { rule: 'LG003' },
  )
}
