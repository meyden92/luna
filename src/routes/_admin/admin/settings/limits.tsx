import { createFileRoute } from '@tanstack/react-router';
import { LimitSettingsForm } from '@/components/admin/settings/LimitSettingsForm';
import { platformSettingsQueryOptions } from '@/components/admin/settings/queries';

export const Route = createFileRoute('/_admin/admin/settings/limits')({
  loader: ({ context }) => context.queryClient.ensureQueryData(platformSettingsQueryOptions),
  head: () => ({ meta: [{ title: 'Limits | LunaShare' }] }),
  component: LimitSettingsForm,
});
