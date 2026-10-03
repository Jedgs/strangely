import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolveApiOrigin } from './src/services/backend-config.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, root, 'VITE_');
  const apiOrigin = resolveApiOrigin(
    process.env.VITE_API_URL ?? environment.VITE_API_URL,
  );
  if (command === 'build' && !apiOrigin.startsWith('https://'))
    throw new Error(
      'Set VITE_API_URL to your HTTPS backend origin before building the frontend.',
    );
  const websocketOrigin = apiOrigin.replace(/^https:/, 'wss:');
  return {
    root,
    plugins: [
      react(),
      {
        name: 'strangely-production-csp',
        apply: 'build',
        transformIndexHtml() {
          return [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: [
                  "default-src 'self'",
                  "script-src 'self' 'wasm-unsafe-eval'",
                  "style-src 'self'",
                  "img-src 'self' data:",
                  "media-src 'self' blob:",
                  `connect-src 'self' ${apiOrigin} ${websocketOrigin}`,
                  "worker-src 'self' blob:",
                  "object-src 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  'upgrade-insecure-requests',
                ].join('; '),
              },
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    ],
    server: {
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
