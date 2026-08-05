import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Native/node-only packages that must never be bundled into the client and stay
// external in the SSR server build. Without the client exclusion Vite happily
// pre-bundles `mariadb` for the client when something transitively imports
// `@/libs/prismadb`, which then crashes the browser at runtime inside the mariadb
// Node-version check (`process.versions.node.replace(...)`).
const SERVER_ONLY_PACKAGES = [
  'mariadb',
  '@prisma/client',
  '@prisma/adapter-mariadb',
  '@aws-sdk/client-s3',
  '@aws-sdk/lib-storage',
  '@aws-sdk/s3-request-presigner',
  'sharp',
  'replicate',
];

export default defineConfig({
  plugins: [
    // Tailwind v4 via its Vite plugin (replaces `@tailwindcss/postcss`, which
    // breaks under Vite 8's CSS pipeline resolving `@import "tailwindcss"`).
    tailwindcss(),
    tanstackStart(),
    // Register the cron TaskManager as a Nitro startup plugin (replaces the old
    // Next.js `instrumentation.ts`).
    nitro({ plugins: ['./src/server/nitro/init-tasks.ts'] }),
    viteReact(),
  ],
  // `better-auth` is excluded from the client pre-bundle (it pulls in the node-only
  // server adapter), but it must be BUNDLED into the SSR server build via
  // `ssr.noExternal` — otherwise its React client (`better-auth/react`) resolves a
  // separate external React instance during SSR, leaving the hook dispatcher null
  // (`Cannot read properties of null (reading 'useRef')`). `resolve.dedupe` keeps a
  // single React instance for good measure.
  optimizeDeps: { exclude: [...SERVER_ONLY_PACKAGES, 'better-auth'] },
  ssr: { external: SERVER_ONLY_PACKAGES, noExternal: ['better-auth'] },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@db': path.resolve(__dirname, '.prisma/generated/client'),
    },
  },
  server: {
    port: 3000,
    host: process.env.HOSTNAME ?? '0.0.0.0',
  },
});
