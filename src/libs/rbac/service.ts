import { ADMIN_GROUP_KEY, isUserAdmin, USER_GROUP_KEY } from '@/db/queries/rbac';

/**
 * The RBAC surface the application imports. The group keys and the admin check
 * live in the query module (`src/db/queries/rbac.ts`) because they are database
 * identity and the Drizzle handle stays inside `src/db/` (issue #15); they are
 * surfaced here so call sites keep importing from where they always did.
 */
export { ADMIN_GROUP_KEY, isUserAdmin, USER_GROUP_KEY };

/**
 * Authorization is read straight from the database on every check, so there is
 * nothing cached to invalidate. Kept as the seam the call sites already use, so
 * introducing a cache later stays a one-file change.
 */
export function invalidateAuthorizationContext(userId?: string): void {
  void userId;
}
