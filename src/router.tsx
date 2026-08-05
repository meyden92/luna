import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { Spinner } from '@/components/ui/spinner';
import type { RootRouteContext } from './route-context';
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
    <div className="flex justify-center pt-24">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

function RouteError({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-24 text-center">
      <p className="text-sm font-medium">Something went wrong while loading this page.</p>
      <p className="max-w-md text-xs text-muted-foreground break-all">{error.message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
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

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
