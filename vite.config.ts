import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    // Страница замеров собирается вместе с приложением: мерить надо на том же коде,
    // который увидит пользователь, а не на дев-сборке.
    rollupOptions: { input: { app: 'index.html', bench: 'bench.html' } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    benchmark: { include: ['src/**/*.bench.ts'] },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/__tests__/**', 'src/core/__bench__/**', 'src/core/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
