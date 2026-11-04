import { createFileRoute } from '@tanstack/react-router';
import { studioSettingsQueryOptions } from '@/components/admin/studio/queries';
import { StudioSettingsForm } from '@/components/admin/studio/StudioSettingsForm';

export const Route = createFileRoute('/_admin/admin/studio/settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(studioSettingsQueryOptions),
  head: () => ({ meta: [{ title: 'Studio settings | LunaShare' }] }),
  component: StudioSettingsForm,
});
