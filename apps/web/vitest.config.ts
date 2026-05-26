import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '../../packages/core/src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@neq/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
})
