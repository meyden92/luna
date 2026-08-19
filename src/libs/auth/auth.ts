import { betterAuth } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { auditUserCreated, authDatabaseAdapter } from '@/db/queries/auth';
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
  plugins: [adminPlugin(), tanstackStartCookies()],
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
  socialProviders: {
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      prompt: 'consent',
      scope: ['email', 'identify', 'guilds'],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
