import { validateTokenKey as lookupTokenKey } from '@/db/queries/auth';

// Resolves a raw API token key to its enabled token record and owning user.
// Single source of truth for token auth — used by both tokenMiddleware and
// raw route handlers (e.g. the ShareX upload endpoint) that can't use
// TanStack middleware.
//
// The lookup itself, and the case normalisation the Postgres migration needs,
// live in the query module; this stays as the seam its call sites already
// import.
export function validateTokenKey(key: string) {
  return lookupTokenKey(key);
}
