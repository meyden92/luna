import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who is creating the User that Better-Auth's `user.create.after` hook is about
 * to audit. The hook receives only the new User, so `createUserWithCredentials`
 * runs the creation inside `creationActor.run(adminId, ...)` and the hook reads
 * the store. Outside such a run (a script, a self-service path) there is no
 * acting admin and the new User is recorded as their own actor.
 */
export const creationActor = new AsyncLocalStorage<string | null | undefined>();
