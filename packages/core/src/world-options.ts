import type { FeatureDef } from './definitions.js'
import type { ContentRegistry } from './content.js'
import type { Diagnostic } from './scheduler.js'
import type { LogEntry } from './context-types.js'
import { LuneGoError } from './errors.js'

export interface WorldOptions {
  readonly features: readonly FeatureDef[]
  readonly seed?: number
  readonly schemaVersion?: number
  readonly dt?: number
  readonly dev?: boolean
  readonly content?: ContentRegistry
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void
  readonly onLog?: (entry: LogEntry) => void
}

export interface RestoreOptions {
  readonly features: readonly FeatureDef[]
  readonly schemaVersion: number
  readonly dt?: number
  readonly dev?: boolean
  readonly content?: ContentRegistry
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void
  readonly onLog?: (entry: LogEntry) => void
}

export function assertWorldOptions(dt: number, schemaVersion: number): void {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new LuneGoError('world_invalid', 'dt must be a positive finite number')
  }
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new LuneGoError('world_invalid', 'schemaVersion must be a positive integer')
  }
}
