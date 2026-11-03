import { betterAuth } from 'better-auth';
import { admin as adminPlugin, username as usernamePlugin } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { auditUserCreated, authDatabaseAdapter } from '@/db/queries/auth';
import { isValidUsername, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@/schemas/credentials-schema';
import { clientIp } from '../client-ip';
import { env } from '../env';
import { ensureUserHasDefaultGroup } from '../rbac/default-group';
import { creationActor } from './creation-actor';

const CLIENT_IP_HEADER = 'x-lunashare-client-ip';

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
    // Registration is closed — Users are created by an admin or by
    // scripts/auth/set-credentials.ts — so the public sign-up endpoint, which
    // is mounted either way, must refuse.
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
          await auditUserCreated(user, creationActor.getStore());
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
      // Set only by `handleAuthRequest`, never taken from the client.
      ipAddressHeaders: [CLIENT_IP_HEADER],
    },
  },
  // The rate-limit middleware in src/server/middleware cannot cover sign-in: it
  // wraps TanStack server functions, and sign-in runs through Better-Auth's own
  // request handler. This store is in-memory, so the window resets on deploy.
  rateLimit: {
    // The window is keyed on IP and path. The end-to-end suite runs the
    // production image with this on behind one simulated proxy hop; each of
    // its Playwright contexts sends its own `x-forwarded-for`, so no context
    // throttles another.
    enabled: env.NODE_ENV === 'production',
    customRules: {
      '/sign-in/username': { window: 60 * 15, max: 5 },
      '/sign-in/email': { window: 60 * 15, max: 5 },
    },
  },
});

/**
 * Hands a request from the `/api/auth/*` route to Better-Auth. Better-Auth can
 * only read the client IP from a header, so this replaces CLIENT_IP_HEADER with
 * the address `clientIp` derives from the socket peer and TRUSTED_PROXY_HOPS
 * (#100): whatever IP header a client sends never reaches the rate limiter or
 * the session record.
 */
export function handleAuthRequest(request: Request, socketIp: string | undefined): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIp(request.headers, env.TRUSTED_PROXY_HOPS, socketIp);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return auth.handler(new Request(request, { headers }));
}

export type Session = typeof auth.$Infer.Session;
