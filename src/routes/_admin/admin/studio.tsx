import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { studioStatusQueryOptions } from '@/components/studio/studio-status';

/** The Studio's admin pages exist only while the Studio is enabled. */
export const Route = createFileRoute('/_admin/admin/studio')({
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.ensureQueryData(studioStatusQueryOptions);
    if (!status.enabled) throw notFound();
  },
  component: Outlet,
});
