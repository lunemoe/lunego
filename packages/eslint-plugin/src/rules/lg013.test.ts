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
    { code: 'export function factory() { return { slots: [] } }', filename: 'src/factory.ts' },
    { code: 'const release = () => undefined', filename: 'src/lifecycle.ts' },
    { code: 'class Fake { dispose() {} }', filename: 'src/__tests__/fake.test.ts' },
    'const value: unknown = 1',
    'const cast = value as SomeType',
    'const message = "TODOS are fine"',
    'const note = "not implemented"',
  ],
  invalid: [
    { code: 'export function allocate() {}', filename: 'src/progression.ts', errors: [{ messageId: 'emptyImplementation' }] },
    { code: 'export const allocate = () => {}', filename: 'src/progression.ts', errors: [{ messageId: 'emptyImplementation' }] },
    { code: 'class Service { allocate() {} }', filename: 'src/progression.ts', errors: [{ messageId: 'emptyImplementation' }] },
    { code: 'export function allocate() { throw new Error("not implemented") }', filename: 'src/progression.ts', errors: [{ messageId: 'placeholder' }] },
    { code: 'export function allocate(_points) { return true }', filename: 'src/progression.ts', errors: [{ messageId: 'constantImplementation' }] },
    { code: "const handler = { run(_ctx, _payload) { return ok() } }", filename: 'src/handler.ts', errors: [{ messageId: 'constantImplementation' }] },
    { code: 'export const load = (_id) => ({ status: "ok" })', filename: 'src/load.ts', errors: [{ messageId: 'constantImplementation' }] },
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
