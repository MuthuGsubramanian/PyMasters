import { defineConfig } from 'vitest/config'

// Separate from vite.config.js so the build config stays untouched. jsdom gives
// us localStorage + window for the api-client tests.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
