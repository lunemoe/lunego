export interface DialogueCondition {
  readonly kind: 'flag' | 'quest' | 'counter'
  readonly key: string
  readonly value?: string | number | boolean
  readonly op?: 'eq' | 'gte' | 'lte'
}

export type DialogueEffectKind = 'flag' | 'quest' | 'event'

export interface DialogueEffect {
  readonly kind: DialogueEffectKind
  readonly key: string
  readonly value?: unknown
}

export interface DialogueChoice {
  readonly id: string
  readonly textKey: string
  readonly next?: string
  readonly conditions?: readonly DialogueCondition[]
  readonly effects?: readonly DialogueEffect[]
  /** A once choice can never be selected again after it is used. */
  readonly once?: boolean
}

export interface DialogueNode {
  readonly id: string
  /** Localization key, not transient UI copy. */
  readonly textKey: string
  readonly next?: string
  readonly conditions?: readonly DialogueCondition[]
  readonly effects?: readonly DialogueEffect[]
  readonly choices?: readonly DialogueChoice[]
  /** Hub nodes may be re-entered by controlled back edges. */
  readonly hub?: boolean
}
