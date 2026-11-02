import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import { parser } from 'typescript-eslint'
import { lg002 } from './lg002.js'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

ruleTester.run('lg002', lg002, {
  valid: [
    'const value = Math.floor(1.5)',
    'const max = Math.max(1, 2)',
    'const obj = { Date: 1 }; obj.Date',
    'const dt = ctx.time.dt',
    'const total = 1 + 2',
    'type D = Date',
    'function f(value: Promise<void>): void { void value }',
    'const { sin } = Math; void sin',
    {
      code: 'const pending: Promise<void> | null = null',
      options: [{ allowPromise: true }],
    },
  ],
  invalid: [
    {
      code: 'const value = Math.random()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const now = Date.now()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'setTimeout(() => {}, 1)',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const el = document.title',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const p = new Promise(() => {})',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const text = value.toLocaleString()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const wave = Math.sin(1)',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'async function run() { await 1 }',
      errors: [{ messageId: 'banned' }, { messageId: 'banned' }],
    },
    {
      code: 'const { random } = Math; random()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const { sin } = Math; sin(1)',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'globalThis.Math.random()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'globalThis.Date.now()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'globalThis.performance.now()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'globalThis.document.title',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'Math["random"]()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'const M = Math; M.random()',
      errors: [{ messageId: 'banned' }],
    },
    {
      code: "Reflect.get(Math, 'random')()",
      errors: [{ messageId: 'banned' }],
    },
    {
      code: 'eval("Math.random()")',
      errors: [{ messageId: 'banned' }],
    },
  ],
})
