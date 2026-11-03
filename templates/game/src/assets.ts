import { Assets } from '../features/_generated/assets.js'

export { Assets }

/** Vite serves the checked assets directory in dev and copies it into the build. */
export function assetUrl(asset: { readonly file: string }): string {
  return `${import.meta.env.BASE_URL}${asset.file}`
}

/** Display the bar's source rectangle without its transparent atlas padding. */
export function barFillBackground(asset: typeof Assets.ui_bar_hp_fill | typeof Assets.ui_bar_xp_fill): string {
  const frame = asset.frames[0]
  const x = frame.x / (asset.frameWidth - frame.width) * 100
  const y = frame.y / (asset.frameHeight - frame.height) * 100
  return `url(${assetUrl(asset)}) ${x}% ${y}% / ${asset.frameWidth / frame.width * 100}% ${asset.frameHeight / frame.height * 100}% no-repeat`
}

export function itemIcon(contentId: string): string {
  return assetUrl(contentId === 'p9.potion' ? Assets.item_potion : contentId === 'p9.relic' ? Assets.equip_weapon_axe : Assets.item_sword)
}
