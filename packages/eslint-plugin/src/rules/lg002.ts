import type { TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

const bannedGlobals: Readonly<Record<string, string>> = {
  Date: 'use ctx.time or a command tick',
  Intl: 'locale-dependent APIs are not deterministic',
  Promise: 'the logic layer is synchronous',
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
  random: 'randomness must come from ctx.rng',
  acos: 'use ctx.math',
  acosh: 'use ctx.math',
  asin: 'use ctx.math',
  asinh: 'use ctx.math',
  atan: 'use ctx.math',
  atan2: 'use ctx.math',
  atanh: 'use ctx.math',
  cbrt: 'use ctx.math',
  cos: 'use ctx.math',
  cosh: 'use ctx.math',
  exp: 'use ctx.math',
  expm1: 'use ctx.math',
  hypot: 'use ctx.math',
  log: 'use ctx.math',
  log10: 'use ctx.math',
  log1p: 'use ctx.math',
  log2: 'use ctx.math',
  pow: 'use ctx.math',
  sin: 'use ctx.math',
  sinh: 'use ctx.math',
  sqrt: 'use ctx.math',
  tan: 'use ctx.math',
  tanh: 'use ctx.math',
}

const localeMembers: Readonly<Record<string, boolean>> = {
  localeCompare: true,
  toLocaleDateString: true,
  toLocaleLowerCase: true,
  toLocaleString: true,
  toLocaleTimeString: true,
  toLocaleUpperCase: true,
}

const globalAliases: Readonly<Record<string, boolean>> = {
  globalThis: true,
  self: true,
  window: true,
}

type Options = [{ readonly allowPromise?: boolean }]

function propertyName(node: TSESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name
  }
  if (
    node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value
  }
  return null
}

/** True when the identifier names a type, never a runtime value. */
function isTypePosition(node: TSESTree.Node): boolean {
  let current: TSESTree.Node = node
  let parent: TSESTree.Node | null = current.parent ?? null
  while (parent !== null) {
    if (parent.type === 'TSAsExpression') {
      return parent.typeAnnotation === current
    }
    if (parent.type === 'TSTypeAnnotation') {
      return true
    }
    if (parent.type.startsWith('TS')) {
      return true
    }
    if (
      parent.type === 'ExportNamedDeclaration' ||
      parent.type === 'ExportDefaultDeclaration' ||
      parent.type === 'Program'
    ) {
      return false
    }
    current = parent
    parent = current.parent ?? null
  }
  return false
}

function isNonReferenceIdentifier(node: TSESTree.Identifier): boolean {
  const parent = node.parent
  if (parent == null) {
    return true
  }
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
    return true
  }
  if (
    (parent.type === 'Property' ||
      parent.type === 'MethodDefinition' ||
      parent.type === 'PropertyDefinition') &&
    parent.key === node &&
    !parent.computed
  ) {
    return true
  }
  if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') {
    return true
  }
  if (parent.type === 'LabeledStatement') {
    return true
  }
  if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') {
    return true
  }
  return false
}

function isOutermostMember(node: TSESTree.MemberExpression): boolean {
  const parent = node.parent
  if (parent == null) {
    return true
  }
  if (parent.type === 'MemberExpression' && parent.object === node) {
    return false
  }
  return true
}

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
    const aliases = new Map<string, string>()

    const report = (node: TSESTree.Node, name: string, reason: string): void => {
      context.report({ node, messageId: 'banned', data: { name, reason } })
    }

    const canonicalName = (node: TSESTree.Node): string | null => {
      if (node.type === 'Identifier') {
        if (globalAliases[node.name] === true) {
          return 'globalThis'
        }
        return aliases.get(node.name) ?? node.name
      }
      if (node.type === 'MemberExpression') {
        const object = canonicalName(node.object)
        const property = propertyName(node)
        if (object === null || property === null) {
          return null
        }
        if (object === 'globalThis') {
          return property
        }
        return `${object}.${property}`
      }
      return null
    }

    const reasonFor = (canonical: string): string | null => {
      if (canonical.startsWith('Math.')) {
        return bannedMath[canonical.slice(5)] ?? null
      }
      const root = canonical.split('.')[0]
      if (root === 'Promise' && allowPromise) {
        return null
      }
      return bannedGlobals[root] ?? null
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && node.init !== null) {
          const canonical = canonicalName(node.init)
          if (canonical === 'Math' || canonical === 'globalThis') {
            aliases.set(node.id.name, canonical)
          }
          return
        }
        if (node.id.type === 'ObjectPattern' && node.init !== null) {
          const canonical = canonicalName(node.init)
          if (canonical !== 'Math' && canonical !== 'globalThis') {
            return
          }
          for (const property of node.id.properties) {
            if (property.type !== 'Property' || property.value.type !== 'Identifier') {
              continue
            }
            const key =
              property.key.type === 'Identifier'
                ? property.key.name
                : property.key.type === 'Literal' && typeof property.key.value === 'string'
                  ? property.key.value
                  : null
            if (key === null) {
              continue
            }
            aliases.set(
              property.value.name,
              canonical === 'globalThis' ? key : `Math.${key}`,
            )
          }
        }
      },
      Identifier(node) {
        if (isTypePosition(node) || isNonReferenceIdentifier(node)) {
          return
        }
        if (node.parent?.type === 'MemberExpression' && node.parent.object === node) {
          return
        }
        if (aliases.has(node.name)) {
          return
        }
        const reason = bannedGlobals[node.name]
        if (reason !== undefined && !(node.name === 'Promise' && allowPromise)) {
          report(node, node.name, reason)
        }
      },
      MemberExpression(node) {
        if (!isOutermostMember(node)) {
          return
        }
        const object = canonicalName(node.object)
        const property = propertyName(node)
        if (object === null || property === null) {
          return
        }
        if (object === 'Math') {
          const reason = bannedMath[property]
          if (reason !== undefined) {
            report(node, `Math.${property}`, reason)
          }
          return
        }
        if (localeMembers[property] === true) {
          report(node, property, 'locale-dependent APIs are not deterministic')
          return
        }
        const canonical = object === 'globalThis' ? property : `${object}.${property}`
        const reason = reasonFor(canonical)
        if (reason !== null) {
          report(node, canonical, reason)
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier') {
          if (node.callee.name === 'eval') {
            report(node, 'eval', 'dynamic code evaluation is not deterministic')
            return
          }
          const canonical = aliases.get(node.callee.name)
          if (canonical !== undefined) {
            const reason = reasonFor(canonical)
            if (reason !== null) {
              report(node, canonical, reason)
            }
          }
          return
        }
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Reflect' &&
          propertyName(node.callee) === 'get'
        ) {
          const target = node.arguments[0]
          const key = node.arguments[1]
          if (
            target !== undefined &&
            key !== undefined &&
            key.type === 'Literal' &&
            typeof key.value === 'string'
          ) {
            const object = canonicalName(target)
            if (object !== null) {
              const canonical = object === 'globalThis' ? key.value : `${object}.${key.value}`
              const reason = reasonFor(canonical)
              if (reason !== null) {
                report(node, canonical, reason)
              }
            }
          }
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
