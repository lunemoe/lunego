import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { faults, injectFault } from './faults.mjs'

const sandbox = process.env.LUNEGO_SANDBOX
if (sandbox === undefined) throw new Error('isolated game root is required')
const fault = process.env.LUNEGO_BROWSER_FAULT === undefined ? null : faults.find(entry => entry.id === process.env.LUNEGO_BROWSER_FAULT && entry.kind === 'browser')
if (fault === undefined) throw new Error('unknown browser fault')

export default {
  root: join(sandbox, 'templates/game'), publicDir: 'assets',
  resolve: { alias: { '/__test__': join(sandbox, 'e2e/fixtures') }, dedupe: ['@lunego/render-pixi', '@lunego/vfx'] },
  plugins: fault === null ? [] : [{
    name: 'lunego-player-contract-fault', enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith(`/${fault.file}`)) return null
      const changed = injectFault(code, fault)
      writeFileSync(process.env.LUNEGO_FAULT_INJECTED, JSON.stringify({ id: fault.id }))
      return { code: changed, map: null }
    },
  }],
  server: { host: '127.0.0.1' },
}
