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
    'declare const input: unknown; const value = input as string',
    '// a normal explanatory comment\nconst value = 1',
    'function check(input: unknown): string { return typeof input === "string" ? input : "" }',
  ],
  invalid: [
    {
      code: 'const value: any = 1',
      errors: [{ messageId: 'anyType' }],
    },
    {
      code: '// @ts-ignore\nconst value = 1',
      errors: [{ messageId: 'tsIgnore' }],
    },
    {
      code: '// TODO: finish this\nconst value = 1',
      errors: [{ messageId: 'placeholder' }],
    },
    {
      code: 'declare const input: unknown; const value = input as unknown as string',
      errors: [{ messageId: 'castThroughUnknown' }],
    },
  ],
})
