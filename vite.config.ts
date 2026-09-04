import path from 'node:path';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Native/node-only packages that must never be bundled into the client and stay
// external in the SSR server build. Without the client exclusion Vite happily
// pre-bundles a database driver for the client when something transitively
// imports `src/db/client`, which then crashes the browser at runtime inside the
// driver's Node-version check (`process.versions.node.replace(...)`).
const SERVER_ONLY_PACKAGES = ['pg', '@aws-sdk/client-s3', '@aws-sdk/lib-storage', '@aws-sdk/s3-request-presigner', 'sharp', 'replicate'];

export default defineConfig({
  plugins: [
    tanstackStart(),
    // Register the cron TaskManager as a Nitro startup plugin (replaces the old
    // Next.js `instrumentation.ts`).
    //
    // `preset: 'bun'` emits a server bundle that boots on Bun's HTTP server
    // (`Bun.serve`) instead of node:http. Override with NITRO_PRESET when a
    // deploy target needs something else (e.g. `node-server` for Node hosts).
    nitro({
      preset: process.env.NITRO_PRESET ?? 'bun',
      plugins: ['./src/server/nitro/init-tasks.ts'],
    }),
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
    },
  },
  server: {
    port: 3000,
    host: process.env.HOSTNAME ?? '0.0.0.0',
  },
});
