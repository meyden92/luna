// Helpers to extract typed user context inside a server-fn handler.
// The middleware chain attaches { user } to context; these helpers narrow the
// `unknown` context arg without forcing every handler to redeclare the type.
import { UnauthorizedError } from '@/libs/rbac/errors';

type AuthedUser = { id: string; email: string };

export interface AuthedContext {
  user: AuthedUser;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isAuthedContext = (context: unknown): context is AuthedContext => {
  if (!isRecord(context) || !isRecord(context.user)) {
    return false;
  }

  return typeof context.user.id === 'string' && context.user.id.length > 0 && typeof context.user.email === 'string';
};

export const userFromCtx = (context: unknown): AuthedUser => {
  if (!isAuthedContext(context)) {
    throw new UnauthorizedError('Authentication required');
  }

  return context.user;
};

export const userIdFromCtx = (context: unknown): string => userFromCtx(context).id;
