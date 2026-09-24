import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/**
 * The signed-in area's guard, and nothing else.
 *
 * It used to own the folder sidebar and the floating upload button. The sidebar
 * belongs to Files alone now — it was dead weight on Generate, Snippets and the
 * tools — and uploading became a global action mounted in `AppShell`, so this
 * layout has no chrome left to render.
 */
export const Route = createFileRoute('/_dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.session?.user?.id) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: Outlet,
});
