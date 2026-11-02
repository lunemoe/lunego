import type { CommandOutcome } from './definitions.js'
import type { CommandEnvelope } from './world-types.js'

export interface PendingCommand {
  readonly envelope: CommandEnvelope
  readonly resolve: (outcome: CommandOutcome) => void
  readonly reject: (reason: unknown) => void
}

/** Command envelopes are queued per target tick and executed in seq order. */
export class CommandQueue {
  private readonly pendingByTick = new Map<number, PendingCommand[]>()
  private readonly log: CommandEnvelope[] = []
  private sequence = 0

  nextSequence(): number {
    const value = this.sequence
    this.sequence += 1
    return value
  }

  enqueue(
    envelope: CommandEnvelope,
    resolve: (outcome: CommandOutcome) => void,
    reject: (reason: unknown) => void,
  ): void {
    this.log.push(envelope)
    const pending: PendingCommand = { envelope, resolve, reject }
    const bucket = this.pendingByTick.get(envelope.tick)
    if (bucket === undefined) {
      this.pendingByTick.set(envelope.tick, [pending])
    } else {
      bucket.push(pending)
    }
  }

  take(tick: number): readonly PendingCommand[] {
    const bucket = this.pendingByTick.get(tick)
    if (bucket === undefined) {
      return []
    }
    this.pendingByTick.delete(tick)
    return [...bucket].sort((left, right) => left.envelope.seq - right.envelope.seq)
  }

  pendingEnvelopes(): readonly CommandEnvelope[] {
    const entries: CommandEnvelope[] = []
    for (const bucket of this.pendingByTick.values()) {
      for (const pending of bucket) {
        entries.push(pending.envelope)
      }
    }
    return entries.sort((left, right) => left.tick - right.tick || left.seq - right.seq)
  }

  restorePending(envelopes: readonly CommandEnvelope[]): void {
    for (const envelope of envelopes) {
      const pending: PendingCommand = {
        envelope: {
          tick: envelope.tick,
          seq: envelope.seq,
          sentAt: envelope.sentAt ?? envelope.tick,
          source: envelope.source,
          type: envelope.type,
          payload: envelope.payload,
        },
        resolve: () => undefined,
        reject: () => undefined,
      }
      this.log.push(pending.envelope)
      const bucket = this.pendingByTick.get(pending.envelope.tick)
      if (bucket === undefined) {
        this.pendingByTick.set(pending.envelope.tick, [pending])
      } else {
        bucket.push(pending)
      }
    }
  }

  rejectAll(error: Error): void {
    for (const bucket of this.pendingByTick.values()) {
      for (const pending of bucket) {
        pending.reject(error)
      }
    }
    this.pendingByTick.clear()
  }

  get entries(): readonly CommandEnvelope[] {
    return this.log
  }

  get nextSeq(): number {
    return this.sequence
  }

  get pendingCount(): number {
    let count = 0
    for (const bucket of this.pendingByTick.values()) {
      count += bucket.length
    }
    return count
  }

  clear(): void {
    this.pendingByTick.clear()
    this.log.length = 0
    this.sequence = 0
  }

  restoreSequence(sequence: number): void {
    this.sequence = sequence
  }
}
