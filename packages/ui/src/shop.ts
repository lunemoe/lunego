import html from 'solid-js/html'
import { activateOnKey } from './a11y.js'
import { resolveText, type TextValue } from './text.js'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface ShopRowProps {
  /** Localized name supplied by the caller. */
  readonly name: UiValue<TextValue>
  readonly icon?: UiValue<string | null>
  /** Pre-formatted price (including any currency label) supplied by the caller. */
  readonly price: UiValue<string | number>
  /** Pre-formatted quantity supplied by the caller; omitted when undefined. */
  readonly quantity?: UiValue<string | number>
  readonly description?: UiValue<TextValue | undefined>
  readonly buyLabel: TextValue
  readonly sellLabel: TextValue
  readonly onBuy?: () => void
  readonly onSell?: () => void
  readonly buyDisabled?: UiValue<boolean>
  readonly sellDisabled?: UiValue<boolean>
  readonly label?: TextValue
  readonly describedBy?: string
}

/**
 * One shop entry: display-only name/price/quantity plus buy/sell callbacks.
 * Stock, affordability and price math stay in the caller.
 */
export function ShopRow(props: ShopRowProps): UiNode {
  const buy = (): void => props.onBuy?.()
  const sell = (): void => props.onSell?.()
  return html`<div class="lg-shop-row" role="group"
    aria-label=${() => (props.label === undefined ? '' : resolveText(props.label))}
    aria-describedby=${() => props.describedBy}>
    ${() => {
      const icon = props.icon === undefined ? null : readValue(props.icon)
      return icon === null || icon === undefined
        ? null
        : html`<img class="lg-shop-row__icon" src=${icon} alt="" draggable="false" />`
    }}
    <div class="lg-shop-row__info">
      <span class="lg-shop-row__name">${() => resolveText(readValue(props.name))}</span>
      ${() => {
        const description = props.description === undefined ? undefined : readValue(props.description)
        return description === undefined
          ? null
          : html`<span class="lg-shop-row__description">${() => resolveText(description)}</span>`
      }}
    </div>
    <span class="lg-shop-row__price">${() => readValue(props.price)}</span>
    ${() => {
      if (props.quantity === undefined) {
        return null
      }
      return html`<span class="lg-shop-row__quantity">${readValue(props.quantity)}</span>`
    }}
    <div class="lg-shop-row__actions">
      <button type="button" class="lg-button lg-shop-row__buy"
        aria-label=${() => resolveText(props.buyLabel)}
        disabled=${() => props.onBuy === undefined || readValue(props.buyDisabled ?? false)}
        onClick=${buy}
        onKeyDown=${activateOnKey(buy)}>${() => resolveText(props.buyLabel)}</button>
      <button type="button" class="lg-button lg-shop-row__sell"
        aria-label=${() => resolveText(props.sellLabel)}
        disabled=${() => props.onSell === undefined || readValue(props.sellDisabled ?? false)}
        onClick=${sell}
        onKeyDown=${activateOnKey(sell)}>${() => resolveText(props.sellLabel)}</button>
    </div>
  </div>`
}
