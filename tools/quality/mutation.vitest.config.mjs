import { writeFileSync } from 'node:fs'
import { faults, injectFault } from './faults.mjs'

const fault = faults.find(entry => entry.id === process.env.LUNEGO_FAULT)
if (fault === undefined) throw new Error('a known fault must be selected')

export default {
  root: process.env.LUNEGO_SANDBOX,
  plugins: [{
    name: 'lunego-contract-fault', enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith(`/${fault.file}`)) return null
      const changed = injectFault(code, fault)
      writeFileSync(process.env.LUNEGO_FAULT_INJECTED, JSON.stringify({ id: fault.id, file: fault.file }))
      return { code: changed, map: null }
    },
  }],
  test: { include: [fault.test], environment: 'node', fsModuleCache: false },
}
