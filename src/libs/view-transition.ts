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
 *
 * Resolves once the animation has finished — which is when a caller that lent
 * an element its `view-transition-name` can take it back.
 */
export function startViewTransition(update: () => void, kind: ViewTransitionKind = 'page'): Promise<void> {
  if (!canViewTransition()) {
    update();
    return Promise.resolve();
  }

  const root = document.documentElement;
  root.dataset.vt = kind;

  const token = String(nextToken++);
  markOnScreen(token);
  const transition = document.startViewTransition(() => {
    flushSync(update);
    markOnScreen(token);
  });

  // A second transition may already have claimed the attribute by the time this
  // one finishes; only the current owner clears it.
  return transition.finished
    .catch(() => {
      // A transition skipped or interrupted by the next one is not an error here.
    })
    .finally(() => {
      if (root.dataset.vt === kind) delete root.dataset.vt;
      for (const element of document.querySelectorAll(`[${LIVE_ATTR}="${token}"]`)) element.removeAttribute(LIVE_ATTR);
    });
}

/** Set on an opted-in `[data-vt-name]` element for one transition; motion.css names only these. */
const LIVE_ATTR = 'data-vt-live';
let nextToken = 0;

/**
 * Marks the opted-in elements inside the viewport. The browser captures every
 * named element as its own group, at a cost that grows faster than their number
 * and freezes the page while it lasts, so a gallery with thousands of cards
 * loaded must cost no more than the screenful anyone can see move.
 */
function markOnScreen(token: string): void {
  const { innerWidth, innerHeight } = window;
  for (const element of document.querySelectorAll<HTMLElement>('[data-vt-name]')) {
    // A card that `content-visibility` skips is off screen, and measuring it would render it.
    if (!element.checkVisibility({ contentVisibilityAuto: true })) continue;
    const box = element.getBoundingClientRect();
    if (box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth) element.setAttribute(LIVE_ATTR, token);
  }
}
