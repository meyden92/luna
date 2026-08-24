import { betterAuth } from 'better-auth';
import { admin as adminPlugin, username as usernamePlugin } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { auditUserCreated, authDatabaseAdapter } from '@/db/queries/auth';
import { isValidUsername, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@/schemas/credentials-schema';
import { env } from '../env';
import { ensureUserHasDefaultGroup } from '../rbac/default-group';

/**
 * Better-Auth on Drizzle (issue #36). The adapter is built inside `src/db/` so
 * the Drizzle handle never leaves it (issue #15); see `authDatabaseAdapter` for
 * why the Postgres provider needs no field overrides.
 *
 * Schema generation and migration are separate concerns now (issue #9):
 * `@better-auth/cli generate` can emit a Drizzle schema but cannot apply it, so
 * `src/db/schema/auth.ts` is hand-owned and Drizzle Kit migrates it.
 */
export const auth = betterAuth({
  plugins: [
    adminPlugin(),
    usernamePlugin({
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
      usernameValidator: isValidUsername,
    }),
    tanstackStartCookies(),
  ],
  emailAndPassword: {
    // The credential Account is the only way a human signs in (#54). Sign-up is
    // closed: Users are created by an admin or by scripts/auth/set-credentials.ts,
    // so the public /sign-up/email endpoint must never accept a registration.
    enabled: true,
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
  },
  database: authDatabaseAdapter(),
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          try {
            await ensureUserHasDefaultGroup(user.id);
          } catch (error) {
            console.error('[RBAC] Failed to assign default group to new user', {
              userId: user.id,
              error,
            });
          }
          // Better-Auth's adapter writes through Drizzle directly, so this is
          // the only place a registration can be audited (#36). writeAuditLog
          // already swallows its own failures, so it cannot break signup.
          await auditUserCreated(user);
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24, // 24 hours
    disableSessionRefresh: false,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
      updateAge: 30,
    },
  },
  advanced: {
    cookiePrefix: 'lunashare',
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
    },
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip'], // or any other custom header
    },
  },
  // A password form is guessable in a way an OAuth redirect never was (#54).
  // The rate-limit middleware in src/server/middleware cannot cover this: it
  // wraps TanStack server functions, and sign-in runs through Better-Auth's own
  // request handler. The default store is in-memory, so the window resets on
  // deploy — accepted for a single-instance self-host.
  rateLimit: {
    // Off outside production, which is Better-Auth's own posture: the window is
    // per IP and per path, and every Playwright request shares one address, so
    // an enabled limiter would throttle the end-to-end suite itself. The
    // consequence is that the throttle is a production-only control with no
    // automated coverage.
    enabled: env.NODE_ENV === 'production',
    customRules: {
      '/sign-in/username': { window: 60 * 15, max: 5 },
      '/sign-in/email': { window: 60 * 15, max: 5 },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
