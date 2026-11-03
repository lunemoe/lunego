import type { GameFrame, RenderSource } from '@lunego/host'
import {
  CameraController, RenderSystem, animatedSpec, animationFrames, assetAnchor,
  createPixiRenderer, defineRenderBinding, rectSpec, spriteSpec, textureManifestFromAssets,
} from '@lunego/render-pixi'
import type { AssetMetadata } from '@lunego/render-pixi'
import { mountCanvasEffectSurface } from '@lunego/vfx'
import type { VfxSystem } from '@lunego/vfx'
import { ActorFacing, ActorPosition, ActorVelocity, CombatDead, CombatHealth, ContentTag, GroundItem, readGroundItem } from '@lunego/kit-runtime'
import { Assets, assetUrl } from '../assets.js'

const BODIES = {
  'p9.player': { texture: 'player_knight', asset: Assets.player_knight },
  'p9.foe': { texture: 'enemy_skeleton_warrior', asset: Assets.enemy_skeleton_warrior },
  'p9.runner': { texture: 'enemy_charger', asset: Assets.enemy_charger },
  'p9.warden': { texture: 'boss_lich', asset: Assets.boss_lich },
  'p9.crate': { texture: 'tile_crate', asset: Assets.tile_crate },
} satisfies Readonly<Record<string, { readonly texture: string; readonly asset: AssetMetadata }>>
type Body = (typeof BODIES)[keyof typeof BODIES]
interface Action { readonly clip: string; readonly started: number }
const WORLD_SCALE = 0.5
const HEALTH_BAR = { height: 2, gap: 3 }

function bodyFor(content: string | undefined): Body {
  if (content === undefined || !(content in BODIES)) throw new Error(`p9 has no appearance for ${content}`)
  return BODIES[content as keyof typeof BODIES]
}

export async function createP9View(vfx: VfxSystem) {
  const renderer = await createPixiRenderer({ width: 480, height: 270, background: 0x101018, container: '#game' })
  const loaded = await renderer.textures.loadManifest(textureManifestFromAssets(Assets, (file) => assetUrl({ file })))
  if (loaded.failed.length > 0) throw new Error(`p9 texture loading failed: ${loaded.failed.map((entry) => entry.id).join(', ')}`)
  const surface = mountCanvasEffectSurface(vfx, '#game', { className: 'vfx-layer', alignTo: renderer.element })
  const renderSystem = new RenderSystem(renderer)
  const camera = new CameraController({ width: 480, height: 270, bounds: { minX: 0, minY: 0, maxX: 480, maxY: 270 } })
  const actions = new Map<number, Action>()
  let elapsed = 0
  let currentStage = 0

  const setStage = (stage: number): void => {
    if (stage === currentStage) return
    currentStage = stage
    const ember = stage % 2 === 0
    const asset = ember ? Assets.ember_tileset : Assets.crypt_tileset
    const width = 480 / asset.frameWidth
    const height = Math.ceil(270 / asset.frameHeight)
    renderer.setTilemap({
      tileset: { texture: ember ? 'ember_tileset' : 'crypt_tileset', tileWidth: asset.frameWidth, tileHeight: asset.frameHeight, columns: asset.columns },
      layers: [{ name: 'floor', width, height, tiles: Array.from({ length: width * height }, (_, index) => {
        const x = index % width
        const y = Math.floor(index / width)
        if (y === 0 || x === 0 || x === width - 1) return ember ? 6 : 7
        const variation = (x * 13 + y * 7 + stage) % 17
        return variation < 2 ? 2 : variation < 4 ? 3 : (x + y) % 2
      }) }],
    })
  }

  renderSystem.add(defineRenderBinding({
    name: 'body', query: [ActorPosition, ContentTag],
    create: (view) => {
      const body = bodyFor(view.get(ContentTag)?.contentId)
      const spec = body.asset.type === 'spritesheet' ? animatedSpec : spriteSpec
      const anchor = assetAnchor(body.asset.anchor)
      return spec(body.texture, { width: body.asset.frameWidth * WORLD_SCALE, height: body.asset.frameHeight * WORLD_SCALE,
        anchorX: anchor?.x ?? 0.5, anchorY: anchor?.y ?? 1,
      })
    },
    update: (object, view) => {
      const position = view.lerp(ActorPosition)
      const body = bodyFor(view.get(ContentTag)?.contentId)
      object.x = position.x
      object.y = position.y
      if (object.kind !== 'animated') return
      const health = view.get(CombatHealth)
      const dead = view.has(CombatDead) || (health?.current ?? 1) <= 0
      const action = actions.get(view.entity)
      const actionClip = body.asset.animations.find((entry) => entry.name === action?.clip)
      const actionDuration = actionClip === undefined ? 0 : actionClip.frames / (actionClip.fps ?? 8)
      object.visible = !dead || (action !== undefined && elapsed <= action.started + actionDuration + 0.3)
      const moving = view.get(ActorVelocity)
      const active = action !== undefined && (elapsed < action.started + actionDuration || dead)
      const clip = active ? action.clip : moving !== undefined && (moving.x !== 0 || moving.y !== 0) ? (body.texture === 'player_knight' ? 'walk' : 'move') : 'idle'
      const animation = body.asset.animations.find((entry) => entry.name === clip) ?? body.asset.animations[0]
      if (animation === undefined) throw new Error(`p9 asset ${body.texture} is missing animations`)
      const facing = view.get(ActorFacing)
      const row = body.texture !== 'player_knight' || facing === undefined ? 0 : Math.abs(facing.y) > Math.abs(facing.x) ? (facing.y < 0 ? 3 : 0) : (facing.x < 0 ? 1 : 2)
      object.frames = animationFrames(body.asset, animation, { row })
      object.fps = animation.fps ?? body.asset.fps ?? 8
      object.loop = animation.loop ?? true
      if (active) object.frame = Math.min(object.frames.length - 1, Math.max(0, Math.floor((elapsed - action.started) * object.fps)))
      else delete object.frame
    },
  }))
  renderSystem.add(defineRenderBinding({
    name: 'health', query: [ActorPosition, ContentTag, CombatHealth], layer: 'foreground',
    create: (view) => rectSpec(bodyFor(view.get(ContentTag)?.contentId).asset.frameWidth * WORLD_SCALE, HEALTH_BAR.height, 0xc8392b),
    update: (object, view) => {
      if (object.kind !== 'rect') return
      const health = view.get(CombatHealth)
      const body = bodyFor(view.get(ContentTag)?.contentId)
      const width = body.asset.frameWidth * WORLD_SCALE
      object.visible = health !== undefined && health.current > 0 && health.current < health.max
      object.width = width * ((health?.current ?? 0) / (health?.max || 1))
      const position = view.lerp(ActorPosition)
      const top = renderSystem.anchorOf(view.entity, 'top', { binding: 'body' })
      object.x = (top?.x ?? position.x) - width / 2
      object.y = (top?.y ?? position.y) - HEALTH_BAR.gap
    },
  }))
  renderSystem.add(defineRenderBinding({
    name: 'loot', query: [ActorPosition, GroundItem],
    create: () => spriteSpec('item_sword', { width: Assets.item_sword.frameWidth * WORLD_SCALE, height: Assets.item_sword.frameHeight * WORLD_SCALE, anchorX: 0.5, anchorY: 1 }),
    update: (object, view) => {
      const position = view.lerp(ActorPosition)
      object.x = position.x
      object.y = position.y
      if (object.kind !== 'sprite') return
      const item = readGroundItem(view.get(GroundItem)?.item)
      object.texture = item.contentId === 'p9.potion' ? 'item_potion' : item.contentId === 'p9.relic' ? 'equip_weapon_axe' : 'item_sword'
      object.tint = item.rarity === 'rare' ? 0xffda80 : item.rarity === 'magic' ? 0x90c8ff : 0xffffff
    },
  }))

  const present = (frame: GameFrame): void => {
    for (const event of frame.events) {
      const value = event.payload as { readonly source?: number; readonly target?: number; readonly ability?: string }
      const entity = event.type === 'runtime.ability.used' ? value.source : value.target
      if (entity === undefined) continue
      let clip: string
      if (event.type === 'runtime.combat.died') clip = 'death'
      else if (event.type === 'runtime.combat.damaged') clip = 'hurt'
      else if (event.type === 'runtime.ability.used') clip = value.ability === 'p9.burst' ? 'cast' : value.ability === 'p9.slam' ? 'smash' : value.ability === 'p9.strike' ? 'attack1' : 'attack'
      else continue
      actions.set(entity, { clip, started: frame.elapsed })
    }
  }
  const sync = (source: RenderSource, time: number, stage: number): void => {
    elapsed = time
    setStage(stage)
    for (const entity of actions.keys()) if (!source.has(entity, ActorPosition)) actions.delete(entity)
    renderSystem.sync(source, time)
  }
  const clear = (): void => { actions.clear(); currentStage = 0 }
  return { renderer, surface, renderSystem, camera, present, sync, clear }
}
