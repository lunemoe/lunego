import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  Panel,
  UiRoot,
  createUiBridge,
  mountUi,
  type UiFrame,
  type UiGame,
} from '../index.js'

function frame(tick: number): UiFrame {
  return { tick, events: [], cues: [], modelPatches: [], models: {} }
}

function fakeGame(): UiGame {
  return {
    frame: frame(1),
    send: async () => ({ status: 'ok' }),
    query: () => 1,
    subscribeFrames: () => () => undefined,
  }
}

function htmlSpan(text: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = text
  return span
}

describe('ui theme contract', () => {
  it('applies caller theme tokens and keeps neutral defaults', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    mountUi(root, createUiBridge(fakeGame(frame(1, 1))), () =>
      UiRoot({
        theme: {
          accent: '#123456',
          font: 'Georgia, serif',
          radius: '12px',
          spacing: '7px',
          fontSize: '15px',
        },
        uiScale: 1.25,
        reducedMotion: true,
        children: Panel({
          title: 'Neutral',
          borderImage: '/caller/frame.png',
          borderSlice: 6,
          borderWidth: 10,
          children: htmlSpan('Body'),
        }),
      }),
    )
    const ui = root.querySelector<HTMLElement>('.lg-ui')
    expect(ui?.style.getPropertyValue('--lg-accent')).toBe('#123456')
    expect(ui?.style.getPropertyValue('--lg-font')).toBe('Georgia, serif')
    expect(ui?.style.getPropertyValue('--lg-radius')).toBe('12px')
    expect(ui?.style.getPropertyValue('--lg-space')).toBe('7px')
    expect(ui?.style.getPropertyValue('--lg-font-size')).toBe('15px')
    expect(ui?.style.getPropertyValue('--lg-ui-scale')).toBe('1.25')
    expect(ui?.getAttribute('data-reduced-motion')).toBe('true')
    const panel = root.querySelector<HTMLElement>('.lg-panel')
    expect(panel?.style.getPropertyValue('--lg-panel-image')).toContain('/caller/frame.png')
    expect(panel?.style.getPropertyValue('--lg-panel-slice')).toBe('6')
    expect(panel?.style.getPropertyValue('--lg-panel-border')).toBe('10')
    const css = document.querySelector('style[data-lunego-ui]')?.textContent ?? ''
    expect(css).toContain('var(--lg-accent)')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('does not embed game copy or asset paths in framework components', async () => {
    const candidates = [
      join(process.cwd(), 'src', 'components.ts'),
      join(process.cwd(), 'packages', 'ui', 'src', 'components.ts'),
    ]
    const file = candidates.find((candidate) => existsSync(candidate))
    if (file === undefined) {
      throw new Error('components.ts not found')
    }
    const source = await readFile(file, 'utf8')
    for (const forbidden of ["'Empty slot'", "'Nothing here'", '"Skills"', "'Close'", 'assets/']) {
      expect(source).not.toContain(forbidden)
    }
  })
})

