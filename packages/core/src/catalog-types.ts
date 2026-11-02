import type { ContextDeclarations } from './context-declarations.js'
import type {
  HandlerDef,
  InvariantDef,
  QueryDef,
  SystemDef,
} from './definitions.js'

export interface SystemBinding {
  readonly def: SystemDef
  readonly feature: string
  readonly declarations: ContextDeclarations
}

export interface HandlerBinding {
  readonly def: HandlerDef
  readonly feature: string
  readonly declarations: ContextDeclarations
}

export interface QueryBinding {
  readonly def: QueryDef
  readonly feature: string
  readonly declarations: ContextDeclarations
}

export interface InvariantBinding {
  readonly def: InvariantDef
  readonly feature: string
}
