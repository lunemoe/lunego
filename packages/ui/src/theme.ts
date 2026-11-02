export interface UiTheme {
  readonly accent?: string
  readonly accentText?: string
  readonly background?: string
  readonly surface?: string
  readonly surfaceRaised?: string
  readonly border?: string
  readonly text?: string
  readonly muted?: string
  readonly danger?: string
  readonly font?: string
  readonly radius?: string
}

export function themeVariables(theme: UiTheme = {}): Record<string, string> {
  return {
    '--lg-accent': theme.accent ?? '#58c8ff',
    '--lg-accent-text': theme.accentText ?? '#08121c',
    '--lg-bg': theme.background ?? 'rgba(8, 14, 24, 0.88)',
    '--lg-surface': theme.surface ?? 'rgba(18, 28, 42, 0.94)',
    '--lg-surface-raised': theme.surfaceRaised ?? 'rgba(28, 42, 62, 0.98)',
    '--lg-border': theme.border ?? '#2f4560',
    '--lg-text': theme.text ?? '#dcecff',
    '--lg-muted': theme.muted ?? '#8aa0b8',
    '--lg-danger': theme.danger ?? '#ff6b6b',
    '--lg-font': theme.font ?? 'ui-monospace, monospace',
    '--lg-radius': theme.radius ?? '4px',
  }
}

export const UI_STYLES = `
.lg-ui {
  --lg-accent: #58c8ff;
  --lg-accent-text: #08121c;
  --lg-bg: rgba(8, 14, 24, 0.88);
  --lg-surface: rgba(18, 28, 42, 0.94);
  --lg-surface-raised: rgba(28, 42, 62, 0.98);
  --lg-border: #2f4560;
  --lg-text: #dcecff;
  --lg-muted: #8aa0b8;
  --lg-danger: #ff6b6b;
  --lg-font: ui-monospace, monospace;
  --lg-radius: 4px;
  color: var(--lg-text);
  font-family: var(--lg-font);
  box-sizing: border-box;
}
.lg-ui *, .lg-ui *::before, .lg-ui *::after { box-sizing: inherit; }
.lg-panel {
  position: relative;
  background: var(--lg-surface);
  border: 2px solid var(--lg-border);
  border-radius: var(--lg-radius);
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.lg-panel.has-image {
  border-style: solid;
  border-width: var(--lg-panel-border, 8px);
  border-image-source: var(--lg-panel-image);
  border-image-slice: var(--lg-panel-slice, 8) fill;
  border-image-repeat: stretch;
  background: transparent;
}
.lg-panel__title { margin: 0 0 8px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--lg-accent); }
.lg-bar { position: relative; height: 14px; background: #0a1018; border: 1px solid var(--lg-border); border-radius: 3px; overflow: hidden; min-width: 60px; }
.lg-bar__fill { height: 100%; width: 0%; transition: width .12s linear; background: var(--lg-accent); }
.lg-bar--hp .lg-bar__fill { background: linear-gradient(90deg, #b82d3c, #ff5b6e); }
.lg-bar--mp .lg-bar__fill { background: linear-gradient(90deg, #2455b8, #58a8ff); }
.lg-bar--xp .lg-bar__fill { background: linear-gradient(90deg, #a06a12, #ffd36b); }
.lg-bar__label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; text-shadow: 0 1px 0 #000; }
.lg-button { background: var(--lg-surface-raised); color: var(--lg-text); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); padding: 6px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.lg-button:hover:not(:disabled) { border-color: var(--lg-accent); color: var(--lg-accent); }
.lg-button:focus-visible, .lg-tab:focus-visible, .lg-slot:focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }
.lg-button:disabled { opacity: .45; cursor: default; }
.lg-button--primary { background: var(--lg-accent); color: var(--lg-accent-text); border-color: var(--lg-accent); }
.lg-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--lg-border); }
.lg-tab { background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--lg-muted); padding: 6px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.lg-tab.active { color: var(--lg-accent); border-bottom-color: var(--lg-accent); }
.lg-inventory { display: grid; gap: 4px; }
.lg-slot { position: relative; aspect-ratio: 1; background: #0b1420; border: 1px solid var(--lg-border); border-radius: 3px; color: var(--lg-text); font: inherit; cursor: pointer; display: grid; place-items: center; overflow: hidden; padding: 0; }
.lg-slot.selected { border-color: var(--lg-accent); box-shadow: 0 0 0 1px var(--lg-accent) inset; }
.lg-slot img { width: 100%; height: 100%; image-rendering: pixelated; object-fit: contain; }
.lg-slot__count { position: absolute; right: 2px; bottom: 1px; font-size: 10px; text-shadow: 0 1px 0 #000; }
.lg-tooltip { position: relative; display: inline-flex; }
.lg-tooltip__content { position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); z-index: 20; min-width: 120px; max-width: 260px; padding: 6px 8px; background: var(--lg-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); font-size: 11px; white-space: pre-wrap; pointer-events: none; opacity: 0; }
.lg-tooltip:hover .lg-tooltip__content, .lg-tooltip:focus-within .lg-tooltip__content { opacity: 1; }
.lg-skillbar { display: flex; gap: 4px; }
.lg-skill { position: relative; width: 40px; height: 40px; background: #0b1420; border: 1px solid var(--lg-border); border-radius: 4px; overflow: hidden; padding: 0; cursor: pointer; }
.lg-skill img { width: 100%; height: 100%; image-rendering: pixelated; }
.lg-skill__cooldown { position: absolute; inset: 0; background: rgba(0,0,0,.68); height: 0%; top: auto; bottom: 0; }
.lg-skill__key { position: absolute; right: 2px; bottom: 1px; font-size: 9px; color: var(--lg-muted); }
.lg-keyhint { display: inline-flex; gap: 3px; align-items: center; }
.lg-keyhint kbd { background: #0b1420; border: 1px solid var(--lg-border); border-bottom-width: 2px; border-radius: 3px; padding: 1px 4px; font: inherit; font-size: 10px; }
.lg-modal__backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 100; }
.lg-modal { min-width: 240px; max-width: 560px; max-height: 80vh; overflow: auto; }
.lg-modal__head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 8px; }
.lg-modal__title { margin: 0; font-size: 13px; color: var(--lg-accent); }
.lg-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.lg-list__item { padding: 4px 6px; border-radius: 3px; cursor: pointer; }
.lg-list__item.selected, .lg-list__item:hover { background: var(--lg-surface-raised); }
.lg-list__empty { color: var(--lg-muted); font-size: 11px; padding: 6px; }
.lg-ui input, .lg-ui select { background: #0b1420; color: var(--lg-text); border: 1px solid var(--lg-border); border-radius: 3px; font: inherit; padding: 4px 6px; }
`

export function installUiStyles(doc: Document = document): () => void {
  const existing = doc.querySelector('style[data-lunego-ui]')
  if (existing !== null) {
    return () => undefined
  }
  const style = doc.createElement('style')
  style.setAttribute('data-lunego-ui', '')
  style.textContent = UI_STYLES
  doc.head.appendChild(style)
  return () => {
    style.remove()
  }
}
