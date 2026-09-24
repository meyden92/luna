import { createFileRoute } from '@tanstack/react-router';
import { LargestFilesPanel } from '@/components/settings/largest-files-panel';
import { SettingsSection } from '@/components/settings/settings-section';
import { StorageUsagePanel } from '@/components/settings/storage-usage-panel';

export const Route = createFileRoute('/_dashboard/_settings/settings/storage')({
  head: () => ({ meta: [{ title: 'Storage | LunaShare' }] }),
  component: SettingsStoragePage,
});

function SettingsStoragePage() {
  return (
    <SettingsSection
      title="Storage"
      description="What’s using your space."
    >
      <StorageUsagePanel />
      <LargestFilesPanel />
    </SettingsSection>
  );
}
