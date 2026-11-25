import { createFileRoute, notFound } from '@tanstack/react-router';
import { studioSettingsQueryOptions } from '@/components/admin/studio/queries';
import { StudioSettingsForm } from '@/components/admin/studio/StudioSettingsForm';
import { studioStatusQueryOptions } from '@/components/studio/studio-status';

export const Route = createFileRoute('/_admin/admin/settings/studio')({
  beforeLoad: async ({ context }) => {
    const status = await context.queryClient.ensureQueryData(studioStatusQueryOptions);
    if (!status.enabled) throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(studioSettingsQueryOptions),
  head: () => ({ meta: [{ title: 'Studio settings | LunaShare' }] }),
  component: StudioSettingsForm,
});
