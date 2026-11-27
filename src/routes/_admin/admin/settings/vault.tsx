import { createFileRoute } from '@tanstack/react-router';
import { vaultQueryOptions } from '@/components/admin/vault/queries';
import { VaultSettings } from '@/components/admin/vault/VaultSettings';

export const Route = createFileRoute('/_admin/admin/settings/vault')({
  loader: ({ context }) => context.queryClient.ensureQueryData(vaultQueryOptions),
  head: () => ({ meta: [{ title: 'Vault | LunaShare' }] }),
  component: VaultSettings,
});
