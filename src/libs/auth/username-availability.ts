import { usernameSchema } from '@/schemas/credentials-schema';
import { authClient } from './auth-client';

/**
 * Whether a Username is already taken, answered while it is being typed. Pass
 * `currentUsername` so someone editing their profile is not told their own
 * handle is unavailable.
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
    // A failed check must not block the form; submitting is still refused
    // server-side if the Username really is taken.
    return undefined;
  }
}
