import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_PUBLIC_SERVER_URL,
  plugins: [adminClient()],
});

export type Session = typeof authClient.$Infer.Session;
