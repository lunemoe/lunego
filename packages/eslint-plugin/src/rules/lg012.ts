import type { TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

type Options = [{ readonly maxLines?: number }]
type MessageIds = 'junkDirectory' | 'junkImport' | 'moduleMutable' | 'tooLong'

const junkSegments: Readonly<Record<string, true>> = {
  common: true,
  helpers: true,
  utils: true,
}

const mutableCollections: Readonly<Record<string, true>> = {
  Map: true,
  Set: true,
  WeakMap: true,
  WeakSet: true,
}

function pathSegments(filename: string): string[] {
  return filename.split(/[\\/]/).filter((segment) => segment.length > 0)
}

function importHasJunkSegment(source: string): boolean {
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return false
  }
  return pathSegments(source).some((segment) => junkSegments[segment] === true)
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
        'LG012: {{segment}} is a junk-drawer directory; name the module after its responsibility.',
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
    const reportJunkDirectory = (): void => {
      const segment = pathSegments(filename).find(
        (candidate) => junkSegments[candidate] === true,
      )
      if (segment !== undefined) {
        context.report({
          loc: { line: 1, column: 0 },
          messageId: 'junkDirectory',
          data: { segment },
        })
      }
    }

    return {
      Program(node) {
        reportJunkDirectory()
        const lines = context.sourceCode.lines.length
        if (lines > maxLines) {
          context.report({
            node,
            messageId: 'tooLong',
            data: { actual: String(lines), limit: String(maxLines) },
          })
        }
        for (const statement of node.body) {
          if (statement.type !== 'VariableDeclaration') {
            continue
          }
          if (statement.kind === 'let' || statement.kind === 'var') {
            for (const declarator of statement.declarations) {
              if (declarator.id.type === 'Identifier') {
                context.report({
                  node: declarator,
                  messageId: 'moduleMutable',
                  data: { name: declarator.id.name },
                })
              }
            }
            continue
          }
          for (const declarator of statement.declarations) {
            if (
              declarator.init?.type === 'NewExpression' &&
              declarator.init.callee.type === 'Identifier' &&
              mutableCollections[declarator.init.callee.name] === true
            ) {
              context.report({
                node: declarator,
                messageId: 'moduleMutable',
                data: { name: `${declarator.init.callee.name} binding` },
              })
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
    }
  },
})
