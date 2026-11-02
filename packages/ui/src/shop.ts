import html from 'solid-js/html'
import { readValue, type UiNode, type UiValue } from './ui-types.js'

export interface ShopRowProps {
  /** Localized name supplied by the caller. */
  readonly name: UiValue<string>
  readonly icon?: UiValue<string | null>
  /** Pre-formatted price (including any currency label) supplied by the caller. */
  readonly price: UiValue<string | number>
  /** Pre-formatted quantity supplied by the caller; omitted when undefined. */
  readonly quantity?: UiValue<string | number>
  readonly description?: UiValue<string | undefined>
  readonly buyLabel: string
  readonly sellLabel: string
  readonly onBuy?: () => void
  readonly onSell?: () => void
  readonly buyDisabled?: UiValue<boolean>
  readonly sellDisabled?: UiValue<boolean>
  readonly label?: string
}

/**
 * One shop entry: display-only name/price/quantity plus buy/sell callbacks.
 * Stock, affordability and price math stay in the caller.
 */
export function ShopRow(props: ShopRowProps): UiNode {
  return html`<div class="lg-shop-row" role="group" aria-label=${() => props.label ?? ''}>
    ${() => {
      const icon = props.icon === undefined ? null : readValue(props.icon)
      return icon === null || icon === undefined
        ? null
        : html`<img class="lg-shop-row__icon" src=${icon} alt="" draggable="false" />`
    }}
    <div class="lg-shop-row__info">
      <span class="lg-shop-row__name">${() => readValue(props.name)}</span>
      ${() => {
        const description = props.description === undefined ? undefined : readValue(props.description)
        return description === undefined || description.length === 0
          ? null
          : html`<span class="lg-shop-row__description">${description}</span>`
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
        aria-label=${props.buyLabel}
        disabled=${() => props.onBuy === undefined || readValue(props.buyDisabled ?? false)}
        onClick=${() => props.onBuy?.()}>${props.buyLabel}</button>
      <button type="button" class="lg-button lg-shop-row__sell"
        aria-label=${props.sellLabel}
        disabled=${() => props.onSell === undefined || readValue(props.sellDisabled ?? false)}
        onClick=${() => props.onSell?.()}>${props.sellLabel}</button>
    </div>
  </div>`
}
