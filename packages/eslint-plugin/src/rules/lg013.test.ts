import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import { parser } from 'typescript-eslint'
import { lg013 } from './lg013.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

ruleTester.run('lg013', lg013, {
  valid: [
    'const value: unknown = 1',
    'const cast = value as SomeType',
    'const message = "TODOS are fine"',
    'const note = "not implemented"',
  ],
  invalid: [
    { code: 'const value: any = 1', errors: [{ messageId: 'anyType' }] },
    { code: 'const value = 1 as any', errors: [{ messageId: 'anyType' }] },
    {
      code: 'const value = input as unknown as SomeType',
      errors: [{ messageId: 'castThroughUnknown' }],
    },
    {
      code: '// @ts-ignore\nconst value = 1',
      errors: [{ messageId: 'tsIgnore' }],
    },
    {
      code: '// @ts-expect-error\nconst value = 1',
      errors: [{ messageId: 'tsIgnore' }],
    },
    {
      code: '// TODO fix this\nconst value = 1',
      errors: [{ messageId: 'placeholder' }],
    },
    {
      code: '// FIXME later\nconst value = 1',
      errors: [{ messageId: 'placeholder' }],
    },
    {
      code: '// eslint-disable-next-line no-console\nconst value = 1',
      errors: [{ messageId: 'eslintDisable' }],
    },
    {
      code: '/* eslint-disable no-console */\nconst value = 1',
      errors: [{ messageId: 'eslintDisable' }],
    },
  ],
})
