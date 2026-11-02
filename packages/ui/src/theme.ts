export const UI_LAYERS = { overlay: 20, modal: 100 } as const

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
  /** Neutral fallback tokens; games override them through UiTheme. */
  readonly barBackground?: string
  readonly barPrimaryFrom?: string
  readonly barPrimaryTo?: string
  readonly barSecondaryFrom?: string
  readonly barSecondaryTo?: string
  readonly barTertiaryFrom?: string
  readonly barTertiaryTo?: string
  readonly slotBackground?: string
  readonly panelShadow?: string
  readonly modalBackdrop?: string
  readonly textShadow?: string
  readonly fontSize?: string
  readonly fontSizeSmall?: string
  readonly fontSizeLarge?: string
  readonly spacing?: string
  readonly spacingLarge?: string
  readonly panelPadding?: string
  readonly slotSize?: string
  readonly scale?: string
  readonly cooldownOverlay?: string
  readonly fxShadow?: string
  /** Color-vision mode palette; all neutral until a game overrides them. */
  readonly colorblindAccent?: string
  readonly colorblindDanger?: string
  readonly colorblindInfo?: string
  readonly colorblindPrimary?: string
  readonly colorblindSecondary?: string
  readonly colorblindTertiary?: string
  /** High-contrast mode palette. */
  readonly contrastBackground?: string
  readonly contrastSurface?: string
  readonly contrastText?: string
  readonly contrastMuted?: string
  readonly contrastBorder?: string
  /** Escape hatch for any framework token, including spacing/size tokens. */
  readonly tokens?: Readonly<Record<string, string>>
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
    '--lg-bar-bg': theme.barBackground ?? '#0a1018',
    '--lg-bar-primary-from': theme.barPrimaryFrom ?? '#b82d3c',
    '--lg-bar-primary-to': theme.barPrimaryTo ?? '#ff5b6e',
    '--lg-bar-secondary-from': theme.barSecondaryFrom ?? '#2455b8',
    '--lg-bar-secondary-to': theme.barSecondaryTo ?? '#58a8ff',
    '--lg-bar-tertiary-from': theme.barTertiaryFrom ?? '#a06a12',
    '--lg-bar-tertiary-to': theme.barTertiaryTo ?? '#ffd36b',
    '--lg-slot-bg': theme.slotBackground ?? '#0b1420',
    '--lg-panel-shadow': theme.panelShadow ?? '0 8px 24px rgba(0,0,0,.35)',
    '--lg-modal-backdrop': theme.modalBackdrop ?? 'rgba(0,0,0,.6)',
    '--lg-text-shadow': theme.textShadow ?? '0 1px 0 #000',
    '--lg-font-size': theme.fontSize ?? '12px',
    '--lg-font-size-small': theme.fontSizeSmall ?? '10px',
    '--lg-font-size-large': theme.fontSizeLarge ?? '13px',
    '--lg-space': theme.spacing ?? '4px',
    '--lg-space-lg': theme.spacingLarge ?? '8px',
    '--lg-panel-padding': theme.panelPadding ?? '10px',
    '--lg-slot-size': theme.slotSize ?? '40px',
    '--lg-ui-scale': theme.scale ?? '1',
    '--lg-cooldown-overlay': theme.cooldownOverlay ?? 'rgba(0,0,0,.68)',
    '--lg-fx-shadow': theme.fxShadow ?? '0 0 6px rgba(0,0,0,.6)',
    '--lg-colorblind-accent': theme.colorblindAccent ?? theme.accent ?? '#58c8ff',
    '--lg-colorblind-danger': theme.colorblindDanger ?? theme.danger ?? '#ff6b6b',
    '--lg-colorblind-info': theme.colorblindInfo ?? theme.accent ?? '#58c8ff',
    '--lg-colorblind-primary': theme.colorblindPrimary ?? theme.barPrimaryTo ?? '#ff5b6e',
    '--lg-colorblind-secondary': theme.colorblindSecondary ?? theme.barSecondaryTo ?? '#58a8ff',
    '--lg-colorblind-tertiary': theme.colorblindTertiary ?? theme.barTertiaryTo ?? '#ffd36b',
    '--lg-contrast-bg': theme.contrastBackground ?? '#000000',
    '--lg-contrast-surface': theme.contrastSurface ?? '#000000',
    '--lg-contrast-text': theme.contrastText ?? '#ffffff',
    '--lg-contrast-muted': theme.contrastMuted ?? '#ffffff',
    '--lg-contrast-border': theme.contrastBorder ?? '#ffffff',
    ...(theme.tokens ?? {}),
  }
}

export const UI_STYLES = `
.lg-ui {
  --lg-ui-z: ${UI_LAYERS.overlay};
  --lg-modal-z: ${UI_LAYERS.modal};
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
  --lg-bar-bg: #0a1018;
  --lg-bar-primary-from: #b82d3c;
  --lg-bar-primary-to: #ff5b6e;
  --lg-bar-secondary-from: #2455b8;
  --lg-bar-secondary-to: #58a8ff;
  --lg-bar-tertiary-from: #a06a12;
  --lg-bar-tertiary-to: #ffd36b;
  --lg-slot-bg: #0b1420;
  --lg-panel-shadow: 0 8px 24px rgba(0,0,0,.35);
  --lg-modal-backdrop: rgba(0,0,0,.6);
  --lg-text-shadow: 0 1px 0 #000;
  --lg-font-size: 12px;
  --lg-font-size-small: 10px;
  --lg-font-size-large: 13px;
  --lg-space: 4px;
  --lg-space-lg: 8px;
  --lg-panel-padding: 10px;
  --lg-slot-size: 40px;
  --lg-ui-scale: 1;
  --lg-cooldown-overlay: rgba(0,0,0,.68);
  --lg-fx-shadow: 0 0 6px rgba(0,0,0,.6);
  --lg-panel-border: 8px;
  --lg-radius-sm: 3px;
  --lg-bar-height: var(--lg-bar-height);
  --lg-control-min-width: 60px;
  --lg-control-padding: 6px 10px;
  --lg-tooltip-min-width: 120px;
  --lg-tooltip-max-width: 260px;
  --lg-tooltip-offset: 6px;
  --lg-modal-min-width: 240px;
  --lg-modal-max-width: 560px;
  --lg-space-xs: 2px;
  --lg-space-sm: 3px;
  --lg-space-md: 6px;
  --lg-space-xl: 12px;
  --lg-contrast-bg: #000000;
  --lg-contrast-surface: #000000;
  --lg-contrast-text: #ffffff;
  --lg-contrast-muted: #ffffff;
  --lg-contrast-border: #ffffff;
  --lg-colorblind-accent: var(--lg-accent);
  --lg-colorblind-danger: var(--lg-danger);
  --lg-colorblind-info: var(--lg-accent);
  --lg-colorblind-primary: var(--lg-bar-primary-to);
  --lg-colorblind-secondary: var(--lg-bar-secondary-to);
  --lg-colorblind-tertiary: var(--lg-bar-tertiary-to);
  color: var(--lg-text);
  font-size: calc(var(--lg-font-size) * var(--lg-ui-scale));
  font-family: var(--lg-font);
  box-sizing: border-box;
}
.lg-ui *, .lg-ui *::before, .lg-ui *::after { box-sizing: inherit; }
.lg-ui :focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }
.lg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.lg-ui[data-colorblind]:not([data-colorblind="false"]) {
  --lg-accent: var(--lg-colorblind-accent);
  --lg-danger: var(--lg-colorblind-danger);
  --lg-bar-primary-from: var(--lg-colorblind-primary);
  --lg-bar-primary-to: var(--lg-colorblind-primary);
  --lg-bar-secondary-from: var(--lg-colorblind-secondary);
  --lg-bar-secondary-to: var(--lg-colorblind-secondary);
  --lg-bar-tertiary-from: var(--lg-colorblind-tertiary);
  --lg-bar-tertiary-to: var(--lg-colorblind-tertiary);
}
.lg-ui[data-contrast]:not([data-contrast="false"]) {
  --lg-bg: var(--lg-contrast-bg);
  --lg-surface: var(--lg-contrast-surface);
  --lg-surface-raised: var(--lg-contrast-surface);
  --lg-text: var(--lg-contrast-text);
  --lg-muted: var(--lg-contrast-muted);
  --lg-border: var(--lg-contrast-border);
  --lg-text-shadow: none;
  --lg-panel-shadow: none;
}
.lg-ui[data-contrast]:not([data-contrast="false"]) .lg-button,
.lg-ui[data-contrast]:not([data-contrast="false"]) .lg-tab,
.lg-ui[data-contrast]:not([data-contrast="false"]) .lg-slot,
.lg-ui[data-contrast]:not([data-contrast="false"]) .lg-equipment__slot { border-width: 2px; }
.lg-panel {
  position: relative;
  background: var(--lg-surface);
  border: 2px solid var(--lg-border);
  border-radius: var(--lg-radius);
  padding: var(--lg-panel-padding);
  box-shadow: var(--lg-panel-shadow);
}
.lg-panel.has-image {
  border-style: solid;
  border-width: var(--lg-panel-border, 8px);
  border-image-source: var(--lg-panel-image);
  border-image-slice: var(--lg-panel-slice, 8) fill;
  border-image-repeat: stretch;
  background: transparent;
}
.lg-panel__title { margin: 0 0 var(--lg-space-lg); font-size: var(--lg-font-size-large); letter-spacing: .08em; text-transform: uppercase; color: var(--lg-accent); }
.lg-bar { position: relative; height: var(--lg-bar-height); background: var(--lg-bar-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius-sm); overflow: hidden; min-width: var(--lg-control-min-width); }
.lg-bar__fill { height: 100%; width: 0%; transition: width .12s linear; background: var(--lg-accent); }
.lg-bar--hp .lg-bar__fill { background: linear-gradient(90deg, var(--lg-bar-primary-from), var(--lg-bar-primary-to)); }
.lg-bar--mp .lg-bar__fill { background: linear-gradient(90deg, var(--lg-bar-secondary-from), var(--lg-bar-secondary-to)); }
.lg-bar--xp .lg-bar__fill { background: linear-gradient(90deg, var(--lg-bar-tertiary-from), var(--lg-bar-tertiary-to)); }
.lg-bar__label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: var(--lg-font-size-small); text-shadow: var(--lg-text-shadow); }
.lg-button { background: var(--lg-surface-raised); color: var(--lg-text); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); padding: var(--lg-control-padding); font: inherit; font-size: var(--lg-font-size); cursor: pointer; }
.lg-button:hover:not(:disabled) { border-color: var(--lg-accent); color: var(--lg-accent); }
.lg-button:focus-visible, .lg-tab:focus-visible, .lg-slot:focus-visible, .lg-list__item:focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }
.lg-button:disabled { opacity: .45; cursor: default; }
.lg-button--primary { background: var(--lg-accent); color: var(--lg-accent-text); border-color: var(--lg-accent); }
.lg-tabs { display: flex; gap: var(--lg-space); border-bottom: 1px solid var(--lg-border); }
.lg-tab { background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--lg-muted); padding: var(--lg-control-padding); font: inherit; font-size: var(--lg-font-size); cursor: pointer; }
.lg-tab.active { color: var(--lg-accent); border-bottom-color: var(--lg-accent); }
.lg-inventory { display: grid; gap: var(--lg-space); }
.lg-slot { position: relative; aspect-ratio: 1; background: var(--lg-slot-bg); border: 1px solid var(--lg-border); border-radius: 3px; color: var(--lg-text); font: inherit; cursor: pointer; display: grid; place-items: center; overflow: hidden; padding: 0; }
.lg-slot.selected { border-color: var(--lg-accent); box-shadow: 0 0 0 1px var(--lg-accent) inset; }
.lg-slot img { width: 100%; height: 100%; image-rendering: pixelated; object-fit: contain; }
.lg-slot__count { position: absolute; right: 2px; bottom: 1px; font-size: var(--lg-font-size-small); text-shadow: var(--lg-text-shadow); }
.lg-tooltip { position: relative; display: inline-flex; }
.lg-tooltip__content { position: absolute; left: 50%; bottom: calc(100% + var(--lg-tooltip-offset)); transform: translateX(-50%); z-index: var(--lg-ui-z); min-width: var(--lg-tooltip-min-width); max-width: var(--lg-tooltip-max-width); padding: var(--lg-space-md) var(--lg-space-lg); background: var(--lg-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); font-size: var(--lg-font-size-small); white-space: pre-wrap; pointer-events: none; opacity: 0; }
.lg-tooltip:hover .lg-tooltip__content, .lg-tooltip:focus-within .lg-tooltip__content { opacity: 1; }
.lg-tooltip__portal { position: fixed; inset: 0; pointer-events: none; z-index: var(--lg-ui-z); }
.lg-tooltip__portal .lg-tooltip__content { position: fixed; left: 0; top: 0; opacity: 1; }
.lg-skillbar { display: flex; gap: var(--lg-space); }
.lg-skill { position: relative; width: var(--lg-slot-size); height: var(--lg-slot-size); background: var(--lg-slot-bg); border: 1px solid var(--lg-border); border-radius: 4px; overflow: hidden; padding: 0; cursor: pointer; }
.lg-skill img { width: 100%; height: 100%; image-rendering: pixelated; }
.lg-skill__cooldown { position: absolute; inset: 0; background: var(--lg-cooldown-overlay); height: 0%; top: auto; bottom: 0; }
.lg-skill__key { position: absolute; right: 2px; bottom: 1px; font-size: var(--lg-font-size-small); color: var(--lg-muted); }
.lg-keyhint { display: inline-flex; gap: var(--lg-space-sm); align-items: center; }
.lg-keyhint kbd { background: var(--lg-slot-bg); border: 1px solid var(--lg-border); border-bottom-width: 2px; border-radius: var(--lg-radius-sm); padding: 1px var(--lg-space); font: inherit; font-size: var(--lg-font-size-small); }
.lg-modal__backdrop { position: fixed; inset: 0; background: var(--lg-modal-backdrop); display: grid; place-items: center; z-index: var(--lg-modal-z); }
.lg-modal { min-width: var(--lg-modal-min-width); max-width: var(--lg-modal-max-width); max-height: 80vh; overflow: auto; }
.lg-modal__head { display: flex; justify-content: space-between; gap: var(--lg-space-xl); align-items: center; margin-bottom: var(--lg-space-lg); }
.lg-modal__title { margin: 0; font-size: var(--lg-font-size-large); color: var(--lg-accent); }
.lg-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--lg-space-xs); }
.lg-list__item { padding: var(--lg-space) var(--lg-space-md); border-radius: var(--lg-radius-sm); cursor: pointer; }
.lg-list__item.selected, .lg-list__item:hover { background: var(--lg-surface-raised); }
.lg-list__item[aria-disabled="true"] { opacity: .45; cursor: default; }
.lg-list__empty { color: var(--lg-muted); font-size: var(--lg-font-size-small); padding: var(--lg-space-md); }
.lg-fx-number { position: absolute; font: 700 var(--lg-font-size) var(--lg-font, ui-monospace, monospace); text-shadow: var(--lg-text-shadow), var(--lg-fx-shadow); white-space: nowrap; }
.lg-fx-number--crit { font-size: var(--lg-font-size-large); color: var(--lg-bar-tertiary-to); }
.lg-fx-projectile { position: absolute; image-rendering: pixelated; object-fit: contain; transform: translate(-50%, -50%); }
.lg-fx-flash { position: absolute; inset: 0; pointer-events: none; }
.lg-fx-shake { animation: lg-shake 0.16s linear; }
.lg-ui[data-reduced-motion="true"] *, .lg-ui[data-reduced-motion="true"] *::before, .lg-ui[data-reduced-motion="true"] *::after { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  .lg-ui *, .lg-ui *::before, .lg-ui *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
@keyframes lg-shake { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-2px,1px); } 40% { transform: translate(2px,-1px); } 60% { transform: translate(-1px,-2px); } 80% { transform: translate(1px,2px); } }
.lg-toasts { position: fixed; right: var(--lg-space-xl); bottom: var(--lg-space-xl); display: grid; gap: var(--lg-space); z-index: var(--lg-ui-z); max-width: var(--lg-tooltip-max-width); }
.lg-toast { display: flex; gap: var(--lg-space); align-items: center; padding: var(--lg-space-md) var(--lg-space-lg); background: var(--lg-surface-raised); color: var(--lg-text); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); }
.lg-toast__message { flex: 1; }
.lg-toast__close { background: transparent; color: var(--lg-text); border: 0; cursor: pointer; }
.lg-loading { position: fixed; inset: 0; display: grid; place-items: center; background: var(--lg-modal-backdrop); z-index: var(--lg-modal-z); }
.lg-loading__panel { display: grid; gap: var(--lg-space-lg); min-width: var(--lg-modal-min-width); }
.lg-loading__error { color: var(--lg-danger); }
.lg-ui input, .lg-ui select { background: var(--lg-slot-bg); color: var(--lg-text); border: 1px solid var(--lg-border); border-radius: 3px; font: inherit; padding: var(--lg-space) var(--lg-space-md); }
.lg-drag { display: inline-flex; align-items: center; gap: var(--lg-space); cursor: grab; }
.lg-drag--active { cursor: grabbing; }
.lg-drag:focus-visible, .lg-drop:focus-visible, .lg-sortable__cell:focus-visible, .lg-equipment__slot:focus-visible, .lg-tree__item:focus-visible, .lg-graph__viewport:focus-visible, .lg-graph__node:focus-visible, .lg-choices__item:focus-visible, .lg-paged:focus-visible, .lg-minimap__marker:focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 1px; }
.lg-drag-preview { position: fixed; z-index: var(--lg-modal-z); pointer-events: none; transform: translate(-50%, -50%); padding: var(--lg-space) var(--lg-space-md); background: var(--lg-surface-raised); border: 1px solid var(--lg-accent); border-radius: var(--lg-radius); opacity: .9; }
.lg-drop { position: relative; }
.lg-drop--over { outline: 2px dashed var(--lg-accent); outline-offset: -1px; }
.lg-sortable { display: grid; gap: var(--lg-space); }
.lg-sortable__cell { min-width: var(--lg-slot-size); min-height: var(--lg-slot-size); display: grid; place-items: center; padding: var(--lg-space); background: var(--lg-slot-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); color: var(--lg-text); }
.lg-sortable__cell--grabbed { border-color: var(--lg-accent); opacity: .7; }
.lg-sortable__cell--target { outline: 2px dashed var(--lg-accent); outline-offset: -2px; }
.lg-sortable__empty, .lg-vlist__empty, .lg-tree__empty, .lg-choices__empty { color: var(--lg-muted); font-size: var(--lg-font-size-small); padding: var(--lg-space-md); }
.lg-vlist { overflow-y: auto; position: relative; }
.lg-vlist__spacer { position: relative; }
.lg-vlist__window { position: absolute; inset: 0 0 auto; }
.lg-vlist__row { display: flex; align-items: center; padding: 0 var(--lg-space-md); }
.lg-equipment { display: grid; gap: var(--lg-space); }
.lg-equipment__slot { position: relative; display: grid; place-items: center; gap: var(--lg-space-xs); min-height: var(--lg-slot-size); padding: var(--lg-space); background: var(--lg-slot-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); color: var(--lg-text); font: inherit; cursor: pointer; }
.lg-equipment__slot[disabled] { opacity: .45; cursor: default; }
.lg-equipment__icon { width: calc(var(--lg-slot-size) * .7); height: calc(var(--lg-slot-size) * .7); object-fit: contain; image-rendering: pixelated; }
.lg-equipment__empty { color: var(--lg-muted); font-size: var(--lg-font-size-small); }
.lg-equipment__label { font-size: var(--lg-font-size-small); color: var(--lg-muted); }
.lg-tree { list-style: none; margin: 0; padding: 0; }
.lg-tree__item { display: flex; align-items: center; gap: var(--lg-space-xs); padding: var(--lg-space-xs) var(--lg-space); border-radius: var(--lg-radius-sm); cursor: pointer; }
.lg-tree__item:hover { background: var(--lg-surface-raised); }
.lg-tree__item--selected { background: var(--lg-surface-raised); color: var(--lg-accent); }
.lg-tree__item--disabled { opacity: .45; cursor: default; }
.lg-tree__indent { flex: none; }
.lg-tree__toggle { flex: none; width: var(--lg-space-lg); height: var(--lg-space-lg); position: relative; }
.lg-tree__toggle::before { content: ""; position: absolute; left: var(--lg-space-xs); top: 50%; border-style: solid; border-width: 4px 0 4px 5px; border-color: transparent transparent transparent var(--lg-muted); transform: translateY(-50%); }
.lg-tree__toggle[data-expanded="true"]::before { transform: translateY(-50%) rotate(90deg); }
.lg-tree__toggle--leaf::before { display: none; }
.lg-tree__icon { width: var(--lg-font-size-large); height: var(--lg-font-size-large); object-fit: contain; }
.lg-graph { display: inline-flex; flex-direction: column; gap: var(--lg-space); }
.lg-graph__viewport { position: relative; overflow: hidden; background: var(--lg-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); touch-action: none; cursor: grab; }
.lg-graph__canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; }
.lg-graph__edges { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.lg-graph__edge line { stroke: var(--lg-border); stroke-width: 1; }
.lg-graph__edge text { fill: var(--lg-muted); font-size: var(--lg-font-size-small); text-anchor: middle; }
.lg-graph__node { position: absolute; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: var(--lg-space-xs); padding: var(--lg-space) var(--lg-space-md); background: var(--lg-surface-raised); color: var(--lg-text); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); font: inherit; font-size: var(--lg-font-size-small); cursor: pointer; white-space: nowrap; }
.lg-graph__node[disabled] { opacity: .45; cursor: default; }
.lg-graph__node--selected { border-color: var(--lg-accent); color: var(--lg-accent); }
.lg-graph__icon { width: var(--lg-font-size-large); height: var(--lg-font-size-large); object-fit: contain; }
.lg-graph__controls { display: flex; gap: var(--lg-space); }
.lg-dialog { display: grid; gap: var(--lg-space-lg); padding: var(--lg-panel-padding); background: var(--lg-surface); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); }
.lg-dialog__head { display: flex; align-items: center; gap: var(--lg-space-lg); }
.lg-dialog__portrait { width: calc(var(--lg-slot-size) * 1.5); height: calc(var(--lg-slot-size) * 1.5); object-fit: contain; image-rendering: pixelated; }
.lg-dialog__speaker { color: var(--lg-accent); font-size: var(--lg-font-size-large); }
.lg-dialog__text { margin: 0; white-space: pre-wrap; line-height: 1.4; }
.lg-dialog__advance { justify-self: end; }
.lg-choices { display: grid; gap: var(--lg-space-xs); }
.lg-choices__item { display: grid; gap: var(--lg-space-xs); padding: var(--lg-space) var(--lg-space-md); border: 1px solid transparent; border-radius: var(--lg-radius-sm); cursor: pointer; }
.lg-choices__item--active { border-color: var(--lg-accent); }
.lg-choices__item--chosen { background: var(--lg-surface-raised); color: var(--lg-accent); }
.lg-choices__item--disabled { opacity: .45; cursor: default; }
.lg-choices__description { color: var(--lg-muted); font-size: var(--lg-font-size-small); }
.lg-paged { display: grid; gap: var(--lg-space); }
.lg-paged__text { margin: 0; white-space: pre-wrap; }
.lg-paged__nav { display: flex; align-items: center; justify-content: space-between; gap: var(--lg-space); }
.lg-paged__count { color: var(--lg-muted); font-size: var(--lg-font-size-small); }
.lg-shop-row { display: flex; align-items: center; gap: var(--lg-space-lg); padding: var(--lg-space) var(--lg-space-lg); border-bottom: 1px solid var(--lg-border); }
.lg-shop-row__icon { width: var(--lg-slot-size); height: var(--lg-slot-size); object-fit: contain; image-rendering: pixelated; }
.lg-shop-row__info { flex: 1; display: grid; gap: var(--lg-space-xs); min-width: 0; }
.lg-shop-row__name { overflow-wrap: anywhere; }
.lg-shop-row__description { color: var(--lg-muted); font-size: var(--lg-font-size-small); }
.lg-shop-row__price, .lg-shop-row__quantity { font-size: var(--lg-font-size-small); color: var(--lg-muted); }
.lg-shop-row__actions { display: flex; gap: var(--lg-space); }
.lg-minimap { position: relative; overflow: hidden; background: var(--lg-bg); border: 1px solid var(--lg-border); border-radius: var(--lg-radius); }
.lg-minimap__marker { position: absolute; transform: translate(-50%, -50%); width: var(--lg-space-lg); height: var(--lg-space-lg); min-width: 0; padding: 0; border: 1px solid var(--lg-border); border-radius: 50%; cursor: pointer; }
.lg-minimap__marker[data-visible="false"] { opacity: .4; }
.lg-minimap__icon { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
.lg-minimap__player { position: absolute; width: var(--lg-space-lg); height: var(--lg-space-lg); background: var(--lg-accent); clip-path: polygon(50% 0, 100% 100%, 50% 72%, 0 100%); pointer-events: none; }
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
