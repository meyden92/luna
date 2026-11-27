import { createFileRoute } from '@tanstack/react-router';
import { platformSettingsQueryOptions } from '@/components/admin/settings/queries';
import { StorageSettingsForm } from '@/components/admin/settings/StorageSettingsForm';

export const Route = createFileRoute('/_admin/admin/settings/storage')({
  loader: ({ context }) => context.queryClient.ensureQueryData(platformSettingsQueryOptions),
  head: () => ({ meta: [{ title: 'Storage settings | LunaShare' }] }),
  component: StorageSettingsForm,
});
