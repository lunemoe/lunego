import type { TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

const bannedGlobals: Readonly<Record<string, string>> = {
  Date: 'use ctx.time or a command tick',
  Intl: 'locale-dependent APIs are not deterministic',
  XMLHttpRequest: 'logic must not use browser/platform APIs',
  WebSocket: 'logic must not use browser/platform APIs',
  Worker: 'logic must not use browser/platform APIs',
  alert: 'logic must not use browser/platform APIs',
  cancelAnimationFrame: 'logic must not use browser/platform APIs',
  clearInterval: 'logic must not use timers',
  clearTimeout: 'logic must not use timers',
  confirm: 'logic must not use browser/platform APIs',
  crypto: 'logic must not use platform randomness',
  document: 'logic must not touch the DOM',
  fetch: 'logic must not use network/platform APIs',
  history: 'logic must not use browser/platform APIs',
  localStorage: 'logic must not use browser/platform APIs',
  location: 'logic must not use browser/platform APIs',
  navigator: 'logic must not use browser/platform APIs',
  performance: 'wall-clock time is not deterministic',
  prompt: 'logic must not use browser/platform APIs',
  queueMicrotask: 'the logic layer is synchronous',
  requestAnimationFrame: 'logic must not use browser/platform APIs',
  sessionStorage: 'logic must not use browser/platform APIs',
  setImmediate: 'logic must not use timers',
  setInterval: 'logic must not use timers',
  setTimeout: 'logic must not use timers',
  window: 'logic must not touch the DOM',
}

const bannedMath: Readonly<Record<string, string>> = {
  random: 'randomness must come from ctx.rng (LG002)',
  acos: 'use @lunego/core/math',
  acosh: 'use @lunego/core/math',
  asin: 'use @lunego/core/math',
  asinh: 'use @lunego/core/math',
  atan: 'use @lunego/core/math',
  atan2: 'use @lunego/core/math',
  atanh: 'use @lunego/core/math',
  cbrt: 'use @lunego/core/math',
  cos: 'use @lunego/core/math',
  cosh: 'use @lunego/core/math',
  exp: 'use @lunego/core/math',
  expm1: 'use @lunego/core/math',
  hypot: 'use @lunego/core/math',
  log: 'use @lunego/core/math',
  log10: 'use @lunego/core/math',
  log1p: 'use @lunego/core/math',
  log2: 'use @lunego/core/math',
  pow: 'use @lunego/core/math',
  sin: 'use @lunego/core/math',
  sinh: 'use @lunego/core/math',
  sqrt: 'use @lunego/core/math',
  tan: 'use @lunego/core/math',
  tanh: 'use @lunego/core/math',
}

const localeMembers: Readonly<Record<string, boolean>> = {
  localeCompare: true,
  toLocaleDateString: true,
  toLocaleLowerCase: true,
  toLocaleString: true,
  toLocaleTimeString: true,
  toLocaleUpperCase: true,
}

function isPropertyName(node: TSESTree.Node): boolean {
  const parent = node.parent
  if (parent === undefined) {
    return false
  }
  return (
    (parent.type === 'MemberExpression' &&
      parent.property === node &&
      !parent.computed) ||
    ((parent.type === 'Property' ||
      parent.type === 'MethodDefinition' ||
      parent.type === 'PropertyDefinition') &&
      parent.key === node &&
      !parent.computed)
  )
}

type Options = [{ readonly allowPromise?: boolean }]

export const lg002 = createRule<Options, 'banned'>({
  name: 'lg002',
  meta: {
    type: 'problem',
    docs: {
      description:
        'LG002: forbid nondeterministic APIs in logic (random, clock, timers, Intl, DOM, async flow).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowPromise: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      banned: 'LG002: {{name}} is not allowed in logic ({{reason}}).',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const allowPromise = options.allowPromise ?? false
    const report = (node: TSESTree.Node, name: string, reason: string): void => {
      context.report({ node, messageId: 'banned', data: { name, reason } })
    }

    return {
      Identifier(node) {
        if (isPropertyName(node)) {
          return
        }
        if (node.name === 'Promise') {
          if (!allowPromise) {
            report(node, 'Promise', 'the logic layer is synchronous')
          }
          return
        }
        const reason = bannedGlobals[node.name]
        if (reason !== undefined) {
          report(node, node.name, reason)
        }
      },
      MemberExpression(node) {
        if (node.computed) {
          return
        }
        const object = node.object
        if (object.type === 'Identifier' && object.name === 'Math') {
          const property = node.property.type === 'Identifier' ? node.property.name : ''
          const reason = bannedMath[property]
          if (reason !== undefined) {
            report(node, `Math.${property}`, reason)
          }
        }
        if (node.property.type === 'Identifier' && localeMembers[node.property.name] === true) {
          report(node, node.property.name, 'locale-dependent APIs are not deterministic')
        }
      },
      FunctionDeclaration(node) {
        if (node.async) {
          report(node, 'async function', 'the logic layer is synchronous')
        }
      },
      FunctionExpression(node) {
        if (node.async) {
          report(node, 'async function', 'the logic layer is synchronous')
        }
      },
      ArrowFunctionExpression(node) {
        if (node.async) {
          report(node, 'async function', 'the logic layer is synchronous')
        }
      },
      AwaitExpression(node) {
        report(node, 'await', 'the logic layer is synchronous')
      },
    }
  },
})
