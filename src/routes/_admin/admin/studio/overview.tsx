import { createFileRoute } from '@tanstack/react-router';
import { studioOverviewQueryOptions } from '@/components/admin/studio/queries';
import { StudioOverview } from '@/components/admin/studio/StudioOverview';

export const Route = createFileRoute('/_admin/admin/studio/overview')({
  loader: ({ context }) => context.queryClient.ensureQueryData(studioOverviewQueryOptions),
  head: () => ({ meta: [{ title: 'Studio overview | LunaShare' }] }),
  component: StudioOverview,
});
