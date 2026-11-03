import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('repository determinism coverage', () => {
  it.each([
    'packages/core/src/content.ts',
    'packages/core/src/ecs/component-store.ts',
    'kits/kit-stats/src/index.ts',
    'kits/kit-runtime/src/actor-systems.ts',
    'templates/game/features/adventure/logic/run-cycle.ts',
  ])('rejects wall-clock use in %s', async (filePath) => {
    const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../../', import.meta.url)) })
    const results = await eslint.lintText('export const timestamp = Date.now()\n', { filePath })
    expect(results.flatMap(result => result.messages).some(message => message.ruleId === '@lunego/lg002' && message.severity === 2)).toBe(true)
  })
})
