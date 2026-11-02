import type { TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

type MessageIds = 'anyType' | 'tsIgnore' | 'eslintDisable' | 'castThroughUnknown' | 'placeholder'

const placeholderPattern =
  /\b(TODO|FIXME|XXX|HACK)\b|先这样|占位|临时实现|not implemented|placeholder/i
const tsDirectivePattern = /@ts-(ignore|expect-error|nocheck)\b/
const eslintDisablePattern = /\beslint-disable(?:-next-line|-line)?\b/

function isUnknownType(node: TSESTree.TypeNode): boolean {
  return node.type === 'TSUnknownKeyword'
}

export const lg013 = createRule<[], MessageIds>({
  name: 'lg013',
  meta: {
    type: 'problem',
    docs: {
      description:
        'LG013: no temporary implementations: forbid any, ts-ignore, casts through unknown and placeholder markers.',
    },
    schema: [],
    messages: {
      anyType: 'LG013: do not use any; model the value with a schema or unknown + narrowing.',
      tsIgnore: 'LG013: do not suppress TypeScript with {{directive}}; fix the type instead.',
      eslintDisable:
        'LG013: do not disable lint rules inline ({{directive}}); fix the violation or the rule.',
      castThroughUnknown:
        'LG013: do not cast through unknown; define a real type or validate at the boundary.',
      placeholder:
        'LG013: placeholder marker "{{marker}}" is not allowed; implement it now.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      TSAnyKeyword(node: TSESTree.TSAnyKeyword) {
        context.report({ node, messageId: 'anyType' })
      },
      TSAsExpression(node: TSESTree.TSAsExpression) {
        if (
          node.expression.type === 'TSAsExpression' &&
          isUnknownType(node.expression.typeAnnotation)
        ) {
          context.report({ node, messageId: 'castThroughUnknown' })
        }
      },
      'Program:exit'() {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive = tsDirectivePattern.exec(comment.value)
          if (directive !== null) {
            context.report({
              loc: comment.loc,
              messageId: 'tsIgnore',
              data: { directive: `@ts-${directive[1] ?? 'ignore'}` },
            })
            continue
          }
          const disable = eslintDisablePattern.exec(comment.value)
          if (disable !== null) {
            context.report({
              loc: comment.loc,
              messageId: 'eslintDisable',
              data: { directive: disable[0] },
            })
            continue
          }
          const marker = placeholderPattern.exec(comment.value)
          if (marker !== null) {
            context.report({
              loc: comment.loc,
              messageId: 'placeholder',
              data: { marker: marker[0] },
            })
          }
        }
      },
    }
  },
})
