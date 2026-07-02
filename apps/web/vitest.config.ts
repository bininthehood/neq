import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // tmdb.ts 등 모듈 로드 시점 env 검증용 더미 (실제 호출은 각 테스트가 mock)
    env: { TMDB_API_KEY: 'test-key' },
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
