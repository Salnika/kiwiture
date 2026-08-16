import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'playwright-report', 'test-results', 'coverage', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // The IRVE dataset must never be injected as raw HTML (spec 33.3).
      'react/no-danger': 'off',
      'no-restricted-properties': [
        'error',
        {
          object: 'React',
          property: 'dangerouslySetInnerHTML',
          message: 'Interdit: les donnees IRVE ne doivent jamais etre injectees en HTML.',
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', '*.config.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
