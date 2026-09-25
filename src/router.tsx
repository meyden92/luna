import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/libs/utils';
import { canViewTransition } from '@/libs/view-transition';
import type { RootRouteContext } from './route-context';
import styles from './router.module.css';
import { routeTree } from './routeTree.gen';

// After a redeploy, hashed chunk files referenced by an already-open tab no longer
// exist, so every client-side navigation fails its dynamic import — the URL changes
// but the view never does. Vite reports those failures as `vite:preloadError`; a
// full reload picks up the new build, and since the URL was already pushed the user
// lands on the page they clicked. The reload is throttled through sessionStorage so
// a build that is still only partially reachable (e.g. mid-rollout) can't trap the
// tab in a reload loop.
if (typeof window !== 'undefined') {
  const LAST_RELOAD_KEY = 'lunashare:chunk-reload-at';
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
    if (Date.now() - lastReload < 10_000) return;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  });
}

function RoutePending() {
  return (
    <div className={styles.pending}>
      <Spinner className={styles.spinner} />
    </div>
  );
}

function RouteError({ error }: ErrorComponentProps) {
  return (
    <div className={styles.error}>
      <p className="type-sm weight-medium">Something went wrong while loading this page.</p>
      <p className={cn(styles.errorMessage, 'type-xs')}>{error instanceof Error ? error.message : String(error)}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={cn(styles.reload, 'type-sm')}
      >
        Reload page
      </button>
    </div>
  );
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    context: {
      queryClient,
      session: null,
      initialTheme: 'default',
    } satisfies RootRouteContext,
    // Every navigation animates: the old page fades and the new one rises, per
    // the scopes in src/styles/motion.css. The router calls
    // startViewTransition itself; `data-vt` below is what lets the CSS tell a
    // route change apart from a gallery or preview one.
    defaultViewTransition: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 0,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    // Navigation must never be a silent no-op: show a spinner when a transition
    // takes longer than 300ms, and an actionable error instead of a frozen view.
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
    defaultErrorComponent: RouteError,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  /*
   * Mark the document for the length of a route change so `html[data-vt="page"]`
   * in motion.css applies. The router owns the transition itself; this only
   * scopes it, and it is skipped under reduced motion so a navigation that is
   * not animating cannot leave the attribute behind.
   */
  if (typeof document !== 'undefined') {
    router.subscribe('onBeforeNavigate', () => {
      if (canViewTransition()) document.documentElement.dataset.vt = 'page';
    });
    router.subscribe('onResolved', () => {
      // The route is ready before the animation has played out, so the scope is
      // held for the length of the longest one (380ms) plus a little slack.
      setTimeout(() => {
        if (document.documentElement.dataset.vt === 'page') delete document.documentElement.dataset.vt;
      }, 500);
    });
  }

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
