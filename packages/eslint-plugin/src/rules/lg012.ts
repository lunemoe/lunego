import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

type Options = [{ readonly maxLines?: number }]
type MessageIds = 'junkDirectory' | 'junkImport' | 'moduleMutable' | 'tooLong'

const junkSegments: Readonly<Record<string, true>> = {
  common: true,
  helpers: true,
  utils: true,
}

const mutatingMethods: Readonly<Record<string, true>> = {
  copyWithin: true,
  fill: true,
  pop: true,
  push: true,
  reverse: true,
  shift: true,
  sort: true,
  splice: true,
  unshift: true,
  add: true,
  clear: true,
  delete: true,
  set: true,
}

function pathSegments(filename: string): string[] {
  return filename.split(/[\\/]/).filter((segment) => segment.length > 0)
}

function junkSegment(filename: string): string | null {
  for (const segment of pathSegments(filename)) {
    const name = segment.endsWith('.ts') ? segment.slice(0, -3) : segment
    if (junkSegments[name] === true) {
      return segment
    }
  }
  return null
}

function importHasJunkSegment(source: string): boolean {
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return false
  }
  return pathSegments(source).some((segment) => {
    const name = segment.replace(/\.[^.]*$/, '')
    return junkSegments[name] === true
  })
}

function variableDeclaration(statement: TSESTree.Node): TSESTree.VariableDeclaration | null {
  if (statement.type === 'VariableDeclaration') {
    return statement
  }
  if (
    statement.type === 'ExportNamedDeclaration' &&
    statement.declaration !== null &&
    statement.declaration.type === 'VariableDeclaration'
  ) {
    return statement.declaration
  }
  return null
}

function isModuleBinding(
  context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
  identifier: TSESTree.Identifier,
): TSESLint.Scope.Variable | null {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(identifier)
  while (scope !== null) {
    const variable = scope.set.get(identifier.name)
    if (variable !== undefined) {
      return variable.scope.type === 'module' ? variable : null
    }
    scope = scope.upper
  }
  return null
}

function rootIdentifier(node: TSESTree.Node): TSESTree.Identifier | null {
  let current: TSESTree.Node = node
  for (;;) {
    if (current.type === 'Identifier') {
      return current
    }
    if (current.type === 'MemberExpression') {
      current = current.object
      continue
    }
    if (current.type === 'ChainExpression') {
      current = current.expression
      continue
    }
    if (current.type === 'TSNonNullExpression') {
      current = current.expression
      continue
    }
    return null
  }
}

export const lg012 = createRule<Options, MessageIds>({
  name: 'lg012',
  meta: {
    type: 'problem',
    docs: {
      description:
        'LG012: no junk drawers (utils/common/helpers), module-level mutable state, or oversized files.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxLines: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      junkDirectory:
        'LG012: {{segment}} is a junk-drawer name; name the module after its responsibility.',
      junkImport:
        'LG012: import from {{source}} reaches a junk-drawer directory; import the owning module.',
      moduleMutable:
        'LG012: module-level mutable state ({{name}}) breaks determinism; keep state inside World.',
      tooLong:
        'LG012: file has {{actual}} lines, over the {{limit}} line limit; split it by responsibility.',
    },
  },
  defaultOptions: [{ maxLines: 400 }],
  create(context, [options]) {
    const maxLines = options.maxLines ?? 400
    const filename = context.filename
    const isTestFile = /(?:^|\/)(?:__tests__|.*\.test\.ts$)/.test(filename)
    const reported = new Set<TSESLint.Scope.Variable>()

    const reportVariable = (
      variable: TSESLint.Scope.Variable,
      node: TSESTree.Node,
    ): void => {
      if (reported.has(variable)) {
        return
      }
      reported.add(variable)
      context.report({
        node,
        messageId: 'moduleMutable',
        data: { name: variable.name },
      })
    }

    const checkMutation = (root: TSESTree.Node): void => {
      if (isTestFile) {
        return
      }
      const identifier = rootIdentifier(root)
      if (identifier === null) {
        return
      }
      const variable = isModuleBinding(context, identifier)
      if (variable === null) {
        return
      }
      const definition = variable.defs[0]
      if (
        definition === undefined ||
        definition.type !== 'Variable' ||
        definition.parent?.type !== 'VariableDeclaration' ||
        definition.parent.kind !== 'const'
      ) {
        return
      }
      reportVariable(variable, definition.node)
    }

    return {
      Program(node) {
        const segment = junkSegment(filename)
        if (segment !== null) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'junkDirectory',
            data: { segment },
          })
        }
        const lines = context.sourceCode.lines.length
        if (lines > maxLines) {
          context.report({
            node,
            messageId: 'tooLong',
            data: { actual: String(lines), limit: String(maxLines) },
          })
        }
        for (const statement of node.body) {
          if (isTestFile) {
            break
          }
          const declaration = variableDeclaration(statement)
          if (declaration === null) {
            continue
          }
          if (declaration.kind === 'let' || declaration.kind === 'var') {
            for (const declarator of declaration.declarations) {
              if (declarator.id.type === 'Identifier') {
                const name = declarator.id.name
                const variable = context.sourceCode
                  .getDeclaredVariables(declarator)
                  .find((candidate) => candidate.name === name)
                if (variable !== undefined) {
                  reportVariable(variable, declarator)
                }
              }
            }
          }
        }
      },
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (typeof node.source.value === 'string' && importHasJunkSegment(node.source.value)) {
          context.report({
            node,
            messageId: 'junkImport',
            data: { source: node.source.value },
          })
        }
      },
      AssignmentExpression(node) {
        checkMutation(node.left)
      },
      UpdateExpression(node) {
        checkMutation(node.argument)
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') {
          checkMutation(node.argument)
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') {
          return
        }
        const property = node.callee.computed
          ? node.callee.property.type === 'Literal' &&
            typeof node.callee.property.value === 'string'
            ? node.callee.property.value
            : null
          : node.callee.property.type === 'Identifier'
            ? node.callee.property.name
            : null
        if (property === null || mutatingMethods[property] !== true) {
          return
        }
        checkMutation(node.callee.object)
      },
    }
  },
})
