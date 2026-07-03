import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * native unit test 셋업 — Expo / RN 의 deep integration 은 jest-expo + simulator
 * 가 필요하지만 pure 함수 + I/O wrapper 는 vitest + AsyncStorage mock 으로 충분.
 *
 * 범위:
 * - lib/survey-storage.ts (AsyncStorage wrapper — saveProgress/loadProgress 등)
 * - 그 외 RN-free pure 함수 (analytics-utils 등은 web vitest 에서 이미 커버)
 *
 * RN/Expo 모듈은 alias 로 mock — @react-native-async-storage/async-storage 만.
 * 추가 통합 test 가 필요하면 jest-expo 도입 (별도 PR).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/__tests__/**/*.{test,spec}.ts'],
    alias: {
      // AsyncStorage native module → in-memory mock
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        './lib/__tests__/_mocks/async-storage.ts',
      ),
      // expo-crypto native module → in-memory mock (store.ts randomUUID)
      'expo-crypto': path.resolve(
        __dirname,
        './lib/__tests__/_mocks/expo-crypto.ts',
      ),
    },
  },
  resolve: {
    alias: {
      '@neq/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
});
