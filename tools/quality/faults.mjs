const runtimeTest = 'kits/kit-runtime/src/__tests__/playability.test.ts'

export const faults = [
  { id: 'movement-no-effect', file: 'kits/kit-runtime/src/actor-systems.ts',
    before: 'position.x[entity] += velocity.x[entity] * ctx.time.dt', after: 'position.x[entity] += 0',
    test: 'kits/kit-runtime/src/__tests__/command-effects.test.ts', contract: 'moves through the registered command and stops on release' },
  { id: 'cooldown-bypassed', file: 'kits/kit-runtime/src/attack.ts',
    before: 'if (!check.ok) return reject(check.reason)', after: 'if (false && !check.ok) return reject(check.reason)',
    test: runtimeTest, contract: 'enforces range and persisted per-actor cooldowns, including same-tick commands' },
  { id: 'range-bypassed', file: 'kits/kit-runtime/src/attack.ts',
    before: "if (selected.length === 0) return reject('out_of_range')", after: "if (false) return reject('out_of_range')",
    test: runtimeTest, contract: 'enforces range and persisted per-actor cooldowns, including same-tick commands' },
  { id: 'shield-not-persisted', file: 'kits/kit-runtime/src/combat-systems.ts',
    before: 'ctx.write(CombatDefenses).shield[target] = result.shield', after: 'ctx.write(CombatDefenses).shield[target] = defenses.shield[target]',
    test: runtimeTest, contract: 'consumes shields and applies resistance without requiring defenses on every target' },
  { id: 'equipped-item-lost', file: 'kits/kit-runtime/src/handlers.ts',
    before: 'slots[payload.slot] = equipment.slots[def.slot] ?? null', after: 'slots[payload.slot] = null',
    test: 'kits/kit-runtime/src/__tests__/command-effects.test.ts', contract: 'returns the previous equipped item to inventory without losing its identity' },
  { id: 'potion-no-effect', file: 'kits/kit-runtime/src/handlers.ts',
    before: 'health.current[player] = Math.min(health.max[player], health.current[player] + heal)', after: 'health.current[player] = health.current[player]',
    test: runtimeTest, contract: 'swaps equipped items and consumes healing items only when useful' },
  { id: 'double-pickup', file: 'kits/kit-runtime/src/handlers.ts',
    before: "ctx.write(GroundItem).item[payload.ground] = ''", after: 'void payload.ground',
    test: 'kits/kit-runtime/src/__tests__/command-effects.test.ts', contract: 'rejects a repeated pickup without crashing the tick or duplicating inventory' },
  { id: 'sprite-anchor-doubled', file: 'packages/render-pixi/src/pixi-displays.ts',
    before: 'snapped(spec.x - width * anchorX, spec.pixelSnap ?? true) + width * anchorX', after: 'snapped(spec.x - width * anchorX, spec.pixelSnap ?? true)',
    test: 'packages/render-pixi/src/__tests__/pixi-displays.test.ts', contract: 'aligns painted bounds with measured bounds' },
  { id: 'keyboard-attack-disconnected', kind: 'browser', file: 'templates/game/src/main.ts',
    before: "attack('p9.strike', true); lastAttackTick = game.tick", after: 'lastAttackTick = game.tick',
    test: 'acceptance/p9-controls.spec.ts', contract: 'keyboard combat produces loot and equipment affects damage' },
  { id: 'health-bar-padding', kind: 'browser', file: 'templates/game/src/assets.ts',
    before: 'return `url(${assetUrl(asset)}) ${x}% ${y}% / ${asset.frameWidth / frame.width * 100}% ${asset.frameHeight / frame.height * 100}% no-repeat`',
    after: 'return `url(${assetUrl(asset)}) left center / 100% 100% no-repeat`',
    test: 'acceptance/p9-controls.spec.ts', contract: 'a full health bar visibly fills its right edge' },
]

export function injectFault(source, fault) {
  const occurrences = source.split(fault.before).length - 1
  if (occurrences !== 1) throw new Error(`fault ${fault.id} requires exactly one source anchor; found ${occurrences}`)
  return source.replace(fault.before, fault.after)
}

export function faultDetected(report, fault) {
  if (fault.kind === 'browser') {
    if ((report.errors?.length ?? 0) !== 0) return false
    const visit = suites => suites.some(suite => (suite.specs ?? []).some(spec =>
      spec.title.includes(fault.contract) && spec.tests.some(test => test.expectedStatus === 'passed' &&
        test.results.some(result => result.status === 'failed' && (result.errors ?? []).some(error => /expect\(|AssertionError|expected .* to/s.test(error.message ?? ''))))) || visit(suite.suites ?? []))
    return visit(report.suites ?? [])
  }
  if ((report.unhandledErrors?.length ?? 0) !== 0) return false
  return (report.testResults ?? []).some(file => (file.assertionResults ?? []).some(assertion =>
    assertion.fullName.includes(fault.contract) && assertion.status === 'failed' &&
    (assertion.failureMessages ?? []).some(message => /AssertionError|expected .* to |expected .* equal|expected .* deeply/s.test(message))))
}
