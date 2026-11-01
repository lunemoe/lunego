import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import lunego from '@lunego/eslint-plugin'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/_generated/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.cjs', 'eslint.config.js'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
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
      'packages/core/src/**/*.ts',
      'features/**/logic/**/*.ts',
      'kits/**/logic/**/*.ts',
    ],
    ignores: ['**/__tests__/**', '**/*.test.ts'],
    rules: {
      '@lunego/lg002': 'error',
    },
  },
  {
    files: ['packages/core/src/world.ts', 'packages/core/src/send-command.ts'],
    rules: {
      '@lunego/lg002': ['error', { allowPromise: true }],
    },
  },
)
