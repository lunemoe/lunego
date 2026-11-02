import { describe, expect, it } from 'vitest'
import { DialogueGraph, DialogueRunner, evaluateCondition, type DialogueNode } from '../index.js'

const nodes: readonly DialogueNode[] = [
  {
    id: 'start',
    textKey: 'npc.start',
    effects: [{ kind: 'event', key: 'opened' }],
    choices: [
      { id: 'ask', textKey: 'npc.ask', next: 'answer' },
      { id: 'secret', textKey: 'npc.secret', next: 'answer', conditions: [{ kind: 'flag', key: 'trusted' }] },
    ],
  },
  {
    id: 'answer',
    textKey: 'npc.answer',
    effects: [{ kind: 'quest', key: 'quest.a' }],
  },
]

describe('dialogue graph/runner', () => {
  it('validates conditions and deterministic effects/choices', () => {
    const graph = new DialogueGraph(nodes)
    const effects: string[] = []
    const runner = new DialogueRunner({
      graph,
      context: {
        flag: (key) => key === 'trusted',
        questStatus: () => 'active',
        counter: () => 2,
      },
      hooks: { onEffect: (effect) => effects.push(`${effect.kind}:${effect.key}`) },
    })
    const start = runner.start('start')
    expect(start.ok).toBe(true)
    expect(effects).toEqual(['event:opened'])
    const view = runner.view()
    expect(view.choices.map((choice) => [choice.id, choice.available])).toEqual([
      ['ask', true],
      ['secret', true],
    ])
    const answer = runner.choose('ask')
    expect(answer.ok).toBe(true)
    expect(answer.view?.node.id).toBe('answer')
    expect(effects).toEqual(['event:opened', 'quest:quest.a'])
  })

  it('uses a once choice at most once', () => {
    const graph = new DialogueGraph([
      {
        id: 'once',
        textKey: 'once',
        choices: [{ id: 'only', textKey: 'only', next: 'end', once: true }],
      },
      { id: 'end', textKey: 'end' },
    ])
    const runner = new DialogueRunner({ graph, context: { flag: () => true } })
    expect(runner.start('once').ok).toBe(true)
    expect(runner.choose('only').ok).toBe(true)
    expect(runner.choose('only').ok).toBe(false)
  })

  it('restores used once choices and rejects unknown snapshot references', () => {
    const graph = new DialogueGraph([
      {
        id: 'once',
        textKey: 'once',
        choices: [{ id: 'only', textKey: 'only', next: 'end', once: true }],
      },
      { id: 'end', textKey: 'end' },
    ])
    const first = new DialogueRunner({ graph, context: { flag: () => true } })
    first.start('once')
    expect(first.choose('only').ok).toBe(true)
    const snapshot = JSON.parse(JSON.stringify(first.serialize()))
    const restored = new DialogueRunner({ graph, context: { flag: () => true } })
    restored.restore(snapshot)
    expect(restored.current?.id).toBe('end')
    expect(restored.start('once').ok).toBe(true)
    expect(restored.view().choices[0]?.used).toBe(true)
    expect(restored.choose('only')).toEqual({ ok: false, reason: 'unavailable' })
    expect(() => restored.restore({ version: 1, current: null, used: ['missing\u0000choice'] })).toThrow(/unknown once choice/)
  })

  it('evaluates flags/quests/counters and rejects unavailable start', () => {
    const graph = new DialogueGraph(nodes)
    const runner = new DialogueRunner({
      graph,
      context: { flag: () => false, questStatus: () => 'active', counter: () => 1 },
    })
    expect(evaluateCondition({ kind: 'counter', key: 'x', op: 'gte', value: 1 }, { flag: () => false, counter: () => 1 })).toBe(true)
    expect(runner.start('start').ok).toBe(true)
    expect(runner.view().choices[1]?.available).toBe(false)
    const locked = new DialogueGraph([
      { id: 'locked', textKey: 'key', conditions: [{ kind: 'flag', key: 'never' }] },
    ])
    expect(new DialogueRunner({ graph: locked, context: { flag: () => false } }).start('locked')).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('allows hub back-edges, keeps once choices across loops and restores them', () => {
    const graph = new DialogueGraph([
      { id: 'entry', textKey: 'entry', choices: [{ id: 'enter', textKey: 'enter', next: 'hub' }] },
      {
        id: 'hub',
        textKey: 'hub',
        hub: true,
        choices: [
          { id: 'branch', textKey: 'branch', next: 'branch' },
          { id: 'leave', textKey: 'leave', next: 'end' },
        ],
      },
      {
        id: 'branch',
        textKey: 'branch',
        choices: [
          { id: 'back', textKey: 'back', next: 'hub' },
          { id: 'once', textKey: 'once', next: 'hub', once: true },
        ],
      },
      { id: 'end', textKey: 'end' },
    ])
    const runner = new DialogueRunner({ graph, context: { flag: () => true } })
    expect(runner.start('entry').ok).toBe(true)
    expect(runner.choose('enter').view?.node.id).toBe('hub')
    expect(runner.choose('branch').view?.node.id).toBe('branch')
    expect(runner.choose('once').ok).toBe(true)
    expect(runner.current?.id).toBe('hub')
    expect(runner.choose('branch').ok).toBe(true)
    expect(runner.choose('once')).toEqual({ ok: false, reason: 'unavailable' })

    const snapshot = JSON.parse(JSON.stringify(runner.serialize()))
    const restored = new DialogueRunner({ graph, context: { flag: () => true } })
    restored.restore(snapshot)
    expect(restored.current?.id).toBe('branch')
    expect(restored.view().choices.find((choice) => choice.id === 'once')?.used).toBe(true)
    expect(restored.choose('back').ok).toBe(true)
    expect(restored.current?.id).toBe('hub')
    expect(restored.choose('branch').ok).toBe(true)
    expect(restored.choose('once')).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('guards runaway hub loops with a configurable deterministic step limit', () => {
    const graph = new DialogueGraph([
      {
        id: 'entry',
        textKey: 'entry',
        choices: [{ id: 'enter', textKey: 'enter', next: 'hub' }],
      },
      {
        id: 'hub',
        textKey: 'hub',
        hub: true,
        choices: [{ id: 'again', textKey: 'again', next: 'hub' }],
      },
    ])
    const runner = new DialogueRunner({
      graph,
      context: { flag: () => true },
      maxSteps: 2,
    })
    expect(runner.start('entry').ok).toBe(true)
    expect(runner.choose('enter').ok).toBe(true)
    expect(runner.choose('again').ok).toBe(true)
    expect(() => runner.choose('again')).toThrow(/maxSteps 2/)
    expect(runner.current?.id).toBe('hub')
    expect(() => new DialogueRunner({
      graph,
      context: { flag: () => true },
      maxSteps: 0,
    })).toThrow(/positive integer/)
  })

  it('rejects unreachable components and graphs without entry nodes', () => {
    expect(() => new DialogueGraph([
      { id: 'entry', textKey: 'entry', next: 'end' },
      { id: 'end', textKey: 'end' },
      { id: 'h1', textKey: 'h1', hub: true, next: 'h2' },
      { id: 'h2', textKey: 'h2', next: 'h1' },
    ])).toThrow(/unreachable/)
    expect(() => new DialogueGraph([
      { id: 'h1', textKey: 'h1', hub: true, next: 'h2' },
      { id: 'h2', textKey: 'h2', next: 'h1' },
    ])).toThrow(/no entry node/)
  })

  it('rejects cycles and unknown targets', () => {
    expect(() => new DialogueGraph([
      { id: 'a', textKey: 'a', next: 'b' },
      { id: 'b', textKey: 'b', next: 'a' },
    ])).toThrow(/cycle/)
    expect(() => new DialogueGraph([
      { id: 'a', textKey: 'a', next: 'missing' },
    ])).toThrow(/unknown/)
  })
})
