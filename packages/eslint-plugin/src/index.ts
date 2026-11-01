import { lg002 } from './rules/lg002.js'
import { lg012 } from './rules/lg012.js'
import { lg013 } from './rules/lg013.js'

export const rules = {
  lg002,
  lg012,
  lg013,
}

const plugin = {
  meta: {
    name: '@lunego/eslint-plugin',
    version: '0.0.0',
  },
  rules,
}

export default plugin
