// Imported before any component so its rules precede theirs in every bundle;
// the layer order itself is also prepended to every module (see vite.config.ts).
import '@/styles/globals.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import Navigation from '@/components/landing/Navigation';
import { ImpersonationBar } from '@/components/layout/ImpersonationBar';
import { MainContent } from '@/components/layout/MainContent';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryKeys } from '@/libs/query-keys';
import { getRuntimeConfig, runtimeConfigScript } from '@/libs/runtime-config';
import type { RootRouteContext } from '@/route-context';
import { getCurrentSession } from '@/server/fns/session';
import { getInitialTheme } from '@/server/fns/theme';
import styles from './root.module.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';

export const Route = createRootRouteWithContext<RootRouteContext>()({
  // beforeLoad runs on EVERY navigation (and intent preload). Going through the
  // query client means the SSR-fetched values hydrate into the client cache, so
  // client-side navigations resolve from cache instead of blocking on two
  // server-fn round trips per click.
  beforeLoad: async ({ context }) => {
    const [initialTheme, session] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.user.theme,
        queryFn: () => getInitialTheme(),
        // Only matters for the first SSR paint; next-themes owns it afterwards.
        staleTime: Number.POSITIVE_INFINITY,
      }),
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.user.session,
        queryFn: () => getCurrentSession(),
        staleTime: 30_000,
        revalidateIfStale: true,
      }),
    ]);
    return { initialTheme, session };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'LunaShare' },
      { name: 'description', content: 'Simple file sharing dashboard' },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient, initialTheme } = Route.useRouteContext();

  // Resolves from process.env during SSR and from the injected snapshot in the
  // browser, so both renders produce identical markup.
  const runtimeConfig = getRuntimeConfig();

  return (
    <html
      lang="en"
      className={styles.document}
      suppressHydrationWarning
    >
      <head>
        {/* Must precede <Scripts /> so the snapshot exists before any module
            initialises against it. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: serialised config, escaped in runtimeConfigScript
          dangerouslySetInnerHTML={{ __html: runtimeConfigScript(runtimeConfig) }}
        />
        <HeadContent />
      </head>
      <body className={styles.body}>
        <Suspense>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider
              attribute="data-theme"
              defaultTheme={initialTheme === 'default' ? 'system' : initialTheme}
              enableSystem
              disableTransitionOnChange
            >
              <TooltipProvider delay={200}>
                <a
                  href="#main-content"
                  className="skip-link"
                >
                  Skip to content
                </a>
                <div className={styles.shell}>
                  <ImpersonationBar />
                  <Navigation />
                  <MainContent>
                    <Outlet />
                  </MainContent>
                </div>
                <Toaster toastOptions={{ duration: 6000 }} />
              </TooltipProvider>
            </ThemeProvider>
            {(import.meta as any).env?.DEV ? (
              <>
                <TanStackRouterDevtools position="bottom-right" />
                <ReactQueryDevtools initialIsOpen={false} />
              </>
            ) : null}
          </QueryClientProvider>
        </Suspense>
        <Scripts />
      </body>
    </html>
  );
}
