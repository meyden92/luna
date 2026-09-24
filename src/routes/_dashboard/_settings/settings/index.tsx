import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SettingsSection } from '@/components/settings/settings-section';
import { SharexPanel } from '@/components/settings/sharex-panel';
import { UploadDefaultsPanel } from '@/components/settings/upload-defaults-panel';
import { UploadTokensPanel } from '@/components/settings/upload-tokens-panel';
import { queryKeys } from '@/libs/query-keys';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import { listFolders } from '@/server/fns/folders';

export const Route = createFileRoute('/_dashboard/_settings/settings/')({
  head: () => ({ meta: [{ title: 'Uploads & ShareX | LunaShare' }] }),
  component: SettingsUploadsPage,
});

function SettingsUploadsPage() {
  const { data: settings } = useSuspenseQuery(settingsOverviewQuery);
  const { data: folders = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: queryKeys.folders.all,
    queryFn: async () => listFolders() as Promise<{ id: string; name: string }[]>,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const enabledTokens = settings.tokens.filter((token) => token.enabled);
  const primaryToken = enabledTokens[0] ?? null;

  return (
    <SettingsSection
      title="Uploads & ShareX"
      description="Connect ShareX or other apps, and choose what happens to new uploads."
    >
      <SharexPanel primaryToken={primaryToken} />
      <UploadTokensPanel tokens={settings.tokens} />
      <UploadDefaultsPanel
        tokens={settings.tokens}
        folders={folders}
      />
    </SettingsSection>
  );
}
