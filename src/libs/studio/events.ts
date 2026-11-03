import type { GenerationView } from './views';

/**
 * Per-User fan-out of Studio events to the open `/api/studio/events` streams.
 *
 * In memory, like the rate limiter: one instance serves every tab. The
 * listeners live on `globalThis` because the poller (started from a Nitro
 * plugin) and the routes can load this module as separate instances in dev.
 */

export type StudioEvent = { type: 'generation.updated'; generation: GenerationView };

type Listener = (event: StudioEvent) => void;

const registry = globalThis as typeof globalThis & { __lunashareStudioListeners?: Map<string, Set<Listener>> };
registry.__lunashareStudioListeners ??= new Map();
const listeners = registry.__lunashareStudioListeners;

/** Registers a listener for the User's events; returns its unsubscribe. */
export function subscribeStudioEvents(userId: string, listener: Listener): () => void {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
}

export function hasStudioListeners(userId: string): boolean {
  return listeners.has(userId);
}

export function publishStudioEvent(userId: string, event: StudioEvent): void {
  for (const listener of listeners.get(userId) ?? []) listener(event);
}
