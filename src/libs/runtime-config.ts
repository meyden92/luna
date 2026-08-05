/**
 * Deployment configuration resolved at RUNTIME rather than build time.
 *
 * Values read through `import.meta.env` are inlined as string literals by Vite,
 * which bakes one deployment's domains into the built image and makes it
 * unusable for anyone else. Everything here is read from the process
 * environment on the server and handed to the browser as a snapshot the
 * document injects during SSR, so a single image runs on any domain.
 *
 * Imported by both server and browser code, so it must NOT import the
 * server-only `env` module.
 */

export interface RuntimeConfig {
  /** Public base URL of the CDN serving uploaded files. */
  cdnUrl: string;
  /** Absolute origin of the app. Omitted means "same origin as the document". */
  serverUrl?: string;
}

declare global {
  interface Window {
    __LUNASHARE_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

const EMPTY: RuntimeConfig = { cdnUrl: '' };

// Reached through globalThis rather than the bare `process` global: this module
// is bundled for the browser too, where `process` neither exists nor is typed.
function readFromProcessEnv(): RuntimeConfig {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const cdnUrl = env?.CDN_URL ?? '';
  const serverUrl = env?.PUBLIC_BASE_URL;
  return serverUrl ? { cdnUrl, serverUrl } : { cdnUrl };
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return readFromProcessEnv();
  return window.__LUNASHARE_RUNTIME_CONFIG__ ?? EMPTY;
}

export function getCdnUrl(): string {
  return getRuntimeConfig().cdnUrl;
}

/**
 * Inline script that publishes the snapshot before any bundle executes.
 * `<` is escaped so a hostile value cannot terminate the script element.
 */
export function runtimeConfigScript(config: RuntimeConfig): string {
  return `window.__LUNASHARE_RUNTIME_CONFIG__=${JSON.stringify(config).replace(/</g, '\\u003c')};`;
}
