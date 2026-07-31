import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    // Тесты гоняем последовательно — они работают с реальной БД
    pool: 'forks',
    singleFork: true,
  },
})
