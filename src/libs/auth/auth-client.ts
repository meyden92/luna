import { adminClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { getRuntimeConfig } from '@/libs/runtime-config';

// `serverUrl` is optional: when unset, better-auth targets the document's own
// origin, which is what a self-hosted deployment wants. Set PUBLIC_BASE_URL
// only when the auth API lives on a different origin than the app.
export const authClient = createAuthClient({
  baseURL: getRuntimeConfig().serverUrl,
  plugins: [adminClient(), usernameClient()],
});

export type Session = typeof authClient.$Infer.Session;
