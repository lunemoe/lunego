import type { EffectMeta, EffectModule } from './types.js'

import * as hitSpark from '../vendor/pixelfx/src/fx/impacts/hit-spark.js'
import * as critHit from '../vendor/pixelfx/src/fx/impacts/crit-hit.js'
import * as bluntHit from '../vendor/pixelfx/src/fx/impacts/blunt-hit.js'
import * as parry from '../vendor/pixelfx/src/fx/impacts/parry.js'
import * as smallExplosion from '../vendor/pixelfx/src/fx/explosions/small-explosion.js'
import * as implosion from '../vendor/pixelfx/src/fx/explosions/implosion.js'
import * as cartoonPow from '../vendor/pixelfx/src/fx/explosions/cartoon-pow.js'
import * as dirtExplosion from '../vendor/pixelfx/src/fx/explosions/dirt-explosion.js'
import * as fireball from '../vendor/pixelfx/src/fx/fire/fireball.js'
import * as flamePillar from '../vendor/pixelfx/src/fx/fire/flame-pillar.js'
import * as meteor from '../vendor/pixelfx/src/fx/fire/meteor.js'
import * as torch from '../vendor/pixelfx/src/fx/fire/torch.js'
import * as iceShatter from '../vendor/pixelfx/src/fx/ice/ice-shatter.js'
import * as iceLance from '../vendor/pixelfx/src/fx/ice/ice-lance.js'
import * as snowflakeBurst from '../vendor/pixelfx/src/fx/ice/snowflake-burst.js'
import * as lightningStrike from '../vendor/pixelfx/src/fx/lightning/lightning-strike.js'
import * as zapHit from '../vendor/pixelfx/src/fx/lightning/zap-hit.js'
import * as sparkArc from '../vendor/pixelfx/src/fx/lightning/spark-arc.js'
import * as arcaneOrb from '../vendor/pixelfx/src/fx/arcane/arcane-orb.js'
import * as manaBurst from '../vendor/pixelfx/src/fx/arcane/mana-burst.js'
import * as starFall from '../vendor/pixelfx/src/fx/arcane/star-fall.js'
import * as smite from '../vendor/pixelfx/src/fx/holy/smite.js'
import * as holyPillar from '../vendor/pixelfx/src/fx/holy/holy-pillar.js'
import * as acidSplash from '../vendor/pixelfx/src/fx/nature/acid-splash.js'
import * as earthSpike from '../vendor/pixelfx/src/fx/nature/earth-spike.js'
import * as poisonCloud from '../vendor/pixelfx/src/fx/nature/poison-cloud.js'
import * as darkExplosion from '../vendor/pixelfx/src/fx/shadow/dark-explosion.js'
import * as voidOrb from '../vendor/pixelfx/src/fx/shadow/void-orb.js'
import * as coinSpin from '../vendor/pixelfx/src/fx/pickups/coin-spin.js'
import * as gemSpin from '../vendor/pixelfx/src/fx/pickups/gem-spin.js'
import * as heartPickup from '../vendor/pixelfx/src/fx/pickups/heart-pickup.js'
import * as poof from '../vendor/pixelfx/src/fx/spawn/poof.js'
import * as summonRise from '../vendor/pixelfx/src/fx/spawn/summon-rise.js'
import * as arrow from '../vendor/pixelfx/src/fx/projectiles/arrow.js'
import * as magicMissile from '../vendor/pixelfx/src/fx/projectiles/magic-missile.js'
import * as energyDisc from '../vendor/pixelfx/src/fx/projectiles/energy-disc.js'
import * as waterSplash from '../vendor/pixelfx/src/fx/water/splash.js'
import * as geyser from '../vendor/pixelfx/src/fx/water/geyser.js'

export const PIXELFX_SOURCE = {
  name: 'pixelfx',
  version: '0.3.0',
  commit: 'a84159688af3ca37a4be05a0d422b94451b2e24e',
  url: 'https://github.com/patch-gg/pixelfx',
  license: 'MIT',
} as const

function assertMeta(name: string, meta: EffectMeta): void {
  if (
    meta.size.length !== 2 ||
    meta.origin.length !== 2 ||
    !Number.isFinite(meta.duration)
  ) {
    throw new Error(`pixelfx effect ${name} has an invalid meta block`)
  }
}

function asEffect(name: string, module: unknown): EffectModule {
  const effect = module as EffectModule
  assertMeta(name, effect.meta)
  if ('act' in effect) {
    throw new Error(`pixelfx effect ${name} carries a side-view act rig; only effect layers are allowed`)
  }
  return effect
}

/**
 * Visual names, not gameplay names: the same flame column can be a spell, a
 * burning barrel or a hazard. Effects are authored side-on; the renderer
 * applies the top-down projection from projection.ts.
 */
export const Effects = {
  impactSpark: asEffect('impactSpark', hitSpark),
  impactCritical: asEffect('impactCritical', critHit),
  impactHeavy: asEffect('impactHeavy', bluntHit),
  parryFlash: asEffect('parryFlash', parry),
  explosionSmall: asEffect('explosionSmall', smallExplosion),
  implosion: asEffect('implosion', implosion),
  comicBurst: asEffect('comicBurst', cartoonPow),
  dirtBurst: asEffect('dirtBurst', dirtExplosion),
  flameBolt: asEffect('flameBolt', fireball),
  flameColumn: asEffect('flameColumn', flamePillar),
  meteor: asEffect('meteor', meteor),
  torchFlame: asEffect('torchFlame', torch),
  frostShatter: asEffect('frostShatter', iceShatter),
  iceLance: asEffect('iceLance', iceLance),
  snowBurst: asEffect('snowBurst', snowflakeBurst),
  boltStrike: asEffect('boltStrike', lightningStrike),
  zapFlash: asEffect('zapFlash', zapHit),
  sparkArc: asEffect('sparkArc', sparkArc),
  arcaneOrb: asEffect('arcaneOrb', arcaneOrb),
  manaBurst: asEffect('manaBurst', manaBurst),
  starFall: asEffect('starFall', starFall),
  holyStrike: asEffect('holyStrike', smite),
  holyPillar: asEffect('holyPillar', holyPillar),
  acidSplash: asEffect('acidSplash', acidSplash),
  earthSpike: asEffect('earthSpike', earthSpike),
  poisonCloud: asEffect('poisonCloud', poisonCloud),
  darkBurst: asEffect('darkBurst', darkExplosion),
  voidOrb: asEffect('voidOrb', voidOrb),
  coinSpin: asEffect('coinSpin', coinSpin),
  gemSpin: asEffect('gemSpin', gemSpin),
  heartGlow: asEffect('heartGlow', heartPickup),
  poof: asEffect('poof', poof),
  summonRise: asEffect('summonRise', summonRise),
  arrow: asEffect('arrow', arrow),
  magicMissile: asEffect('magicMissile', magicMissile),
  energyDisc: asEffect('energyDisc', energyDisc),
  waterSplash: asEffect('waterSplash', waterSplash),
  geyser: asEffect('geyser', geyser),
} as const

export type EffectName = keyof typeof Effects
