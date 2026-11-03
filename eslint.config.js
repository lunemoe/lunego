import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import lunego from '@lunego/eslint-plugin'

export default tseslint.config(
  {
    linterOptions: {
      noInlineConfig: true,
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/_generated/**',
      '**/*.d.ts',
      'packages/vfx/vendor/**',
      'packages/cli/templates/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.cjs', '**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    plugins: { '@lunego': lunego },
    rules: {
      '@lunego/lg012': 'error',
      '@lunego/lg013': 'error',
    },
  },
  {
    files: [
      'templates/**/*.ts',
      'games/**/*.ts',
      'features/**/*.ts',
      'kits/**/*.ts',
    ],
    ignores: [
      '**/tests/browser/**',
      '**/*.spec.ts',
      '**/src/*-probe.ts',
      '**/_generated/**',
      '**/*.config.ts',
    ],
    rules: {
      '@lunego/lg016': 'error',
    },
  },
  {
    files: [
      'packages/core/src/**/*.ts',
      '**/features/**/schema.ts',
      '**/features/**/logic/**/*.ts',
      '**/features/**/content/**/*.ts',
      '**/kits/**/schema.ts',
      '**/kits/**/logic/**/*.ts',
      '**/kits/**/content/**/*.ts',
      '**/games/**/schema.ts',
      '**/games/**/logic/**/*.ts',
      '**/games/**/content/**/*.ts',
      '**/games/**/app/**/*.ts',
      '**/apps/**/*.ts',
      '**/src/**/*.ts',
      '**/app/**/*.ts',
      '**/games/**/src/**/*.ts',
      '**/templates/**/src/**/*.ts',
    ],
    ignores: [
      'packages/**',
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
    files: ['packages/core/src/**/*.ts', 'kits/*/src/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: { '@lunego/lg002': 'error' },
  },
  {
    files: ['packages/core/src/world.ts'],
    rules: {
      // The context host is an object literal of getters/arrows that closes
      // over the owning World; aliasing `this` here is the factory pattern.
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  {
    files: ['packages/core/src/world.ts', 'packages/core/src/send-command.ts'],
    rules: {
      '@lunego/lg002': ['error', { allowPromise: true }],
    },
  },
)
