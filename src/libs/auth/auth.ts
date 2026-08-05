import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin as adminPlugin } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { env } from '../env';
import { prismabase } from '../prismadb';
import { ensureUserHasDefaultGroup } from '../rbac/default-group';

export const auth = betterAuth({
  plugins: [adminPlugin(), tanstackStartCookies()],
  database: prismaAdapter(prismabase, {
    provider: 'mysql',
  }),
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
