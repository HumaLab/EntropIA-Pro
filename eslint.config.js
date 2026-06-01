import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Svelte support — enable per-package when eslint-plugin-svelte is installed:
  // import svelte from 'eslint-plugin-svelte'
  // ...svelte.configs['flat/recommended'],
  // {
  //   files: ['**/*.svelte'],
  //   languageOptions: {
  //     parserOptions: {
  //       parser: tseslint.parser,
  //     },
  //   },
  // },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/.turbo/**',
      '**/.svelte-kit/**',
      '**/coverage/**',
    ],
  }
)
