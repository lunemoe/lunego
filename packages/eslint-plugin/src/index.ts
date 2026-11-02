import { lg002 } from './rules/lg002.js'
import { lg012 } from './rules/lg012.js'
import { lg013 } from './rules/lg013.js'
import { lg016 } from './rules/lg016.js'
import tseslint from 'typescript-eslint'

export const rules = {
  lg002,
  lg012,
  lg013,
  lg016,
}

const plugin = {
  meta: {
    name: '@lunego/eslint-plugin',
    version: '0.0.0',
  },
  rules,
}

export default plugin

export const gameConfig = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/_generated/**',
      '**/*.d.ts',
      '**/tests/browser/**',
      '**/*.spec.ts',
      '**/src/*-probe.ts',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/lunego.config.ts',
      '**/playwright.config.ts',
      '.lunego/**',
      '**/.lunego/**',
    ],
  },
  {
    files: [
      '**/features/**/logic/**/*.ts',
      '**/features/**/schema.ts',
      '**/features/**/content/**/*.ts',
      '**/games/**/logic/**/*.ts',
      '**/games/**/schema.ts',
      '**/games/**/content/**/*.ts',
      '**/games/**/app/**/*.ts',
      '**/games/**/src/app/**/*.ts',
      '**/games/**/src/world.ts',
      '**/src/**/*.ts',
      '**/app/**/*.ts',
      '**/games/**/src/**/*.ts',
      '**/templates/**/src/**/*.ts',
      '**/games/**/src/**/logic/**/*.ts',
      '**/features/**/app/**/*.ts',
      '**/kits/**/src/**/*.ts',
      '**/kits/**/schema.ts',
      '**/kits/**/logic/**/*.ts',
      '**/kits/**/content/**/*.ts',
      '**/templates/**/features/**/logic/**/*.ts',
      '**/templates/**/features/**/schema.ts',
      '**/templates/**/features/**/content/**/*.ts',
    ],
    ignores: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/src/main.ts',
      '**/src/view/**',
      '**/src/debug/**',
      '**/src/*-probe.ts',
    ],
    rules: {
      '@lunego/lg002': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@lunego': plugin },
    rules: {
      '@lunego/lg012': 'error',
      '@lunego/lg013': 'error',
      '@lunego/lg016': 'error',
    },
  },
)
