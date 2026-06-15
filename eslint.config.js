import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  // Formatting is owned by prettier-plugin-svelte; disable conflicting stylistic rules.
  ...svelte.configs.prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        // ignoreRestSiblings: the codebase strips fields via rest destructuring ({ a, ...rest }) => rest.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      // Components run in the Tauri webview; no-undef needs the browser globals.
      globals: { ...globals.browser },
      parserOptions: {
        // Parse <script lang="ts"> blocks with the typescript-eslint parser.
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // Bare expressions inside $effect/$derived.by are the runes dependency-tracking idiom here.
      '@typescript-eslint/no-unused-expressions': 'off',
      // Reactive Maps follow a copy-on-write reassignment convention; flagged news are local caches.
      'svelte/prefer-svelte-reactivity': 'off',
      // Empty catch is the established best-effort pattern around localStorage access.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
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
