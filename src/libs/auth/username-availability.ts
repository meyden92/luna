import { usernameSchema } from '@/schemas/credentials-schema';
import { authClient } from './auth-client';

/**
 * The "that one is taken" check the forms run while a Username is being typed
 * (issue #54), rather than making someone submit to find out.
 *
 * Better-Auth's username plugin exposes the lookup, so the rule lives in one
 * place; the unique index is still what actually guarantees it, and submitting
 * a Username taken in the meantime is refused server-side.
 *
 * `currentUsername` is the caller's own handle, which must not count as taken
 * when they are editing their profile and leave it unchanged.
 */
export async function usernameTakenMessage(value: unknown, currentUsername?: string): Promise<string | undefined> {
  if (typeof value !== 'string') return undefined;

  // Nothing to ask about until the value could be a valid Username at all.
  if (!usernameSchema.safeParse(value).success) return undefined;
  if (currentUsername && value.toLowerCase() === currentUsername.toLowerCase()) return undefined;

  try {
    const result = await authClient.isUsernameAvailable({ username: value });
    return result.data?.available === false ? 'That username is already taken' : undefined;
  } catch {
    // A failed check must not block the form: submitting is still refused if
    // the Username really is taken.
    return undefined;
  }
}
