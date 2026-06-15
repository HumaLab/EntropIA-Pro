import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/store', 'packages/ui', 'apps/desktop'],
  },
})
