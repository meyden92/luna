import { createFileRoute, redirect } from '@tanstack/react-router';
import { Downloader } from '@/components/downloader/Downloader';
import { queryKeys } from '@/libs/query-keys';
import { checkCurrentUserIsAdmin } from '@/server/fns/rbac';

// Admin-only, with the same check as the `_admin` layout, but kept under
// `_dashboard` so it has the app nav like the other tools.
export const Route = createFileRoute('/_dashboard/tools/download')({
  beforeLoad: async ({ context }) => {
    const allowed = await context.queryClient.ensureQueryData({
      queryKey: queryKeys.adminRbac.currentUserIsAdmin,
      queryFn: () => checkCurrentUserIsAdmin(),
      staleTime: 30_000,
    });
    if (!allowed) throw redirect({ to: '/unauthorized' });
  },
  head: () => ({ meta: [{ title: 'Downloader | LunaShare' }] }),
  component: Downloader,
});
