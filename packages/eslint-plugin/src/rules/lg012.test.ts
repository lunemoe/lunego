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

const longFile = Array.from({ length: 401 }, (_, index) => `const line${index} = ${index}`).join(
  '\n',
)

ruleTester.run('lg012', lg012, {
  valid: [
    {
      filename: 'packages/core/src/motion.ts',
      code: 'export const x = 1\nexport function f() { let local = 1; return local }',
    },
    {
      filename: 'packages/core/src/motion.ts',
      code: "import { Position } from './schema'",
    },
    {
      filename: 'packages/core/src/motion.ts',
      code: "import { ESLintUtils } from '@typescript-eslint/utils'\nvoid ESLintUtils",
    },
  ],
  invalid: [
    {
      filename: 'src/utils/thing.ts',
      code: 'export const x = 1',
      errors: [{ messageId: 'junkDirectory' }],
    },
    {
      filename: 'src/game.ts',
      code: "import { x } from './helpers/x'",
      errors: [{ messageId: 'junkImport' }],
    },
    {
      filename: 'src/game.ts',
      code: 'let counter = 0',
      errors: [{ messageId: 'moduleMutable' }],
    },
    {
      filename: 'src/game.ts',
      code: 'const cache = new Map()',
      errors: [{ messageId: 'moduleMutable' }],
    },
    {
      filename: 'src/long.ts',
      code: longFile,
      errors: [{ messageId: 'tooLong' }],
    },
  ],
})
