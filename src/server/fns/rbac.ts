import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';
import { isUserAdmin } from '@/libs/rbac/service';

export const checkCurrentUserIsAdmin = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const user = await requireAuthenticatedUser(getRequestHeaders());
    return await isUserAdmin(user.id);
  } catch {
    return false;
  }
});
