export type ProfileSlotStatus = 'ok' | 'corrupt'

export interface ProfileSlotInfo {
  readonly slot: string
  readonly status: ProfileSlotStatus
  /** Monotonic per-slot write counter; 0 for corrupt slots. */
  readonly revision: number
  readonly tick: number | null
  readonly schemaVersion: number | null
  readonly contentHash: string | null
  readonly error: string | null
}

export interface ImportProfileOptions {
  /** Replace existing slots; default is to reject conflicts. */
  readonly overwrite?: boolean
  /** Import the bundle into another account, e.g. character transfer. */
  readonly accountId?: string
}
