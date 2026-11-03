import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the static build works on GitHub Pages under any repo path.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
