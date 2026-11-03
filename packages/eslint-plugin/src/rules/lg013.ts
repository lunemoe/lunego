import type { TSESTree } from '@typescript-eslint/utils'
import { createRule } from '../create-rule.js'

type MessageIds = 'anyType' | 'tsIgnore' | 'eslintDisable' | 'castThroughUnknown' | 'placeholder' | 'emptyImplementation' | 'constantImplementation'

const placeholderPattern =
  /\b(TODO|FIXME|XXX|HACK)\b|先这样|占位|临时实现|not implemented|placeholder/i
const tsDirectivePattern = /@ts-(ignore|expect-error|nocheck)\b/
const eslintDisablePattern = /\beslint-disable(?:-next-line|-line)?\b/

function isUnknownType(node: TSESTree.TypeNode): boolean {
  return node.type === 'TSUnknownKeyword'
}

function constant(node: TSESTree.Node): boolean {
  if (node.type === 'Literal' || (node.type === 'Identifier' && node.name === 'undefined')) return true
  if (node.type === 'ObjectExpression') return node.properties.every(property => property.type === 'Property' && constant(property.value))
  if (node.type === 'ArrayExpression') return node.elements.every(element => element !== null && constant(element))
  return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'ok' && node.arguments.length === 0
}

function entry(node: TSESTree.Node): boolean {
  const parent = node.parent
  if (parent === undefined) return false
  if (parent.type === 'ExportNamedDeclaration') return true
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition') && parent.key.type === 'Identifier' && parent.key.name === 'run') return true
  return parent.type === 'VariableDeclarator' && parent.parent?.parent?.type === 'ExportNamedDeclaration'
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
      emptyImplementation:
        'LG013: an empty implementation provides no behavior; implement it or remove the unused entry.',
      constantImplementation:
        'LG013: an entry ignores all inputs and returns constant success/data; provide the declared behavior.',
    },
  },
  defaultOptions: [],
  create(context) {
    const isTest = /(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\.ts$/.test(context.filename)
    return {
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) {
        if (!isTest && node.body?.type === 'BlockStatement' && node.body.body.length === 0 &&
          !(node.parent.type === 'MethodDefinition' && node.parent.kind === 'constructor')) {
          context.report({ node, messageId: 'emptyImplementation' })
        }
        const statement = node.body?.type === 'BlockStatement' && node.body.body.length === 1 ? node.body.body[0] : undefined
        const value = statement?.type === 'ReturnStatement' ? statement.argument : node.body?.type === 'BlockStatement' ? null : node.body
        const parameters = context.sourceCode.getDeclaredVariables(node).filter(variable => variable.defs.some(definition => definition.type === 'Parameter'))
        if (!isTest && entry(node) && node.params.length > 0 && value !== null && value !== undefined && constant(value) &&
          !parameters.some(variable => variable.references.some(reference => reference.isRead()))) {
          context.report({ node, messageId: 'constantImplementation' })
        }
      },
      ThrowStatement(node: TSESTree.ThrowStatement) {
        if (isTest) return
        const value = node.argument
        if ((value.type === 'NewExpression' || value.type === 'CallExpression') &&
          value.callee.type === 'Identifier' && value.callee.name === 'Error') {
          const message = value.arguments[0]
          if (message?.type === 'Literal' && typeof message.value === 'string') {
            const marker = placeholderPattern.exec(message.value)
            if (marker !== null) context.report({ node, messageId: 'placeholder', data: { marker: marker[0] } })
          }
        }
      },
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
