import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites at https://<user>.github.io/<repo>/
// An absolute base path is required because relative paths (base: './')
// break when the site is accessed without a trailing slash, resolving
// asset URLs against the root domain instead of the repo path.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/smart-circuit-simulator/' : '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
