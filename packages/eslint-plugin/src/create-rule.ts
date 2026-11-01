import { ESLintUtils } from '@typescript-eslint/utils'

export const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/lunemoe/lunego/blob/main/docs/rules/${name.toUpperCase()}.md`,
)
