import { describe, expect, it } from 'vitest'
import plugin, { rules } from './index.js'

describe('plugin surface', () => {
  it('exports the implemented LuneGo rules', () => {
    expect(Object.keys(rules).sort()).toEqual(['lg002', 'lg012', 'lg013'])
    expect(plugin.rules).toBe(rules)
    expect(plugin.meta?.name).toBe('@lunego/eslint-plugin')
  })
})
