import type { FeatureDef } from './definitions.js'
import type { ContentRegistry } from './content.js'
import type { Diagnostic } from './scheduler.js'

export interface WorldOptions {
  readonly features: readonly FeatureDef[]
  readonly seed?: number
  readonly schemaVersion?: number
  readonly dt?: number
  readonly dev?: boolean
  readonly content?: ContentRegistry
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void
}

export interface RestoreOptions {
  readonly features: readonly FeatureDef[]
  readonly schemaVersion: number
  readonly dt?: number
  readonly dev?: boolean
  readonly content?: ContentRegistry
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void
}
