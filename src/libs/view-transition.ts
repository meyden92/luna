import { flushSync } from 'react-dom';

/**
 * The kinds of change the app animates, matching the `html[data-vt]` scopes in
 * src/styles/motion.css:
 * - `page` — a route, a Generate tab, a Snippets or Automations selection
 * - `gallery` — a filter, sort, layout, move, delete or upload in Files
 * - `preview` — opening or closing the Preview, morphing the shared media
 */
export type ViewTransitionKind = 'page' | 'gallery' | 'preview';

/** True when the browser can animate a transition and the user hasn't asked it not to. */
export function canViewTransition(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Apply a state update inside a view transition, tagging the document with the
 * kind for its duration so motion.css can scope the animation.
 *
 * The update is wrapped in `flushSync` so React has painted the new DOM before
 * the browser takes its "after" snapshot. Where a transition isn't available
 * the update simply runs, so callers never need to branch.
 */
export function startViewTransition(update: () => void, kind: ViewTransitionKind = 'page'): void {
  if (!canViewTransition()) {
    update();
    return;
  }

  const root = document.documentElement;
  root.dataset.vt = kind;

  const transition = document.startViewTransition(() => {
    flushSync(update);
  });

  // A second transition may already have claimed the attribute by the time this
  // one finishes; only the current owner clears it.
  transition.finished.finally(() => {
    if (root.dataset.vt === kind) delete root.dataset.vt;
  });
}
