import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import { parser } from 'typescript-eslint'
import { lg012 } from './lg012.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

ruleTester.run('lg012', lg012, {
  valid: [
    'function f() { let x = 0; x += 1; return x }',
    'const list = [1, 2, 3]; export const first = list[0]',
    'const cache = new Set([1, 2]); export const size = cache.size',
    'const box = { n: 1 }; export const value = box.n',
    'const read = new Map([["a", 1]]); export const entry = read.get("a")',
    {
      code: 'export const ok = 1',
      filename: 'src/motion.ts',
    },
  ],
  invalid: [
    { code: 'let x = 0', errors: [{ messageId: 'moduleMutable' }] },
    { code: 'export let x = 0', errors: [{ messageId: 'moduleMutable' }] },
    { code: 'var x = 0', errors: [{ messageId: 'moduleMutable' }] },
    {
      code: 'const list = []; list.push(1)',
      errors: [{ messageId: 'moduleMutable' }],
    },
    {
      code: 'const box = { n: 0 }; box.n += 1',
      errors: [{ messageId: 'moduleMutable' }],
    },
    {
      code: 'const cache = new Map(); cache.set("a", 1)',
      errors: [{ messageId: 'moduleMutable' }],
    },
    {
      code: 'const seen = new Set(); seen.add(1)',
      errors: [{ messageId: 'moduleMutable' }],
    },
    {
      code: 'export const x = 1',
      filename: 'src/utils.ts',
      errors: [{ messageId: 'junkDirectory' }],
    },
    {
      code: "import { a } from './helpers/a'\nvoid a",
      errors: [{ messageId: 'junkImport' }],
    },
    {
      code: 'export const x = 1',
      filename: 'src/common/types.ts',
      errors: [{ messageId: 'junkDirectory' }],
    },
    {
      code: ('// pad\n'.repeat(401)) + 'export const x = 1',
      errors: [{ messageId: 'tooLong' }],
    },
  ],
})
