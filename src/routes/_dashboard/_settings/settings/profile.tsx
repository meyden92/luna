import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ProfilePanel } from '@/components/settings/profile-panel';
import { SettingsSection } from '@/components/settings/settings-section';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';

export const Route = createFileRoute('/_dashboard/_settings/settings/profile')({
  head: () => ({ meta: [{ title: 'Profile | LunaShare' }] }),
  component: SettingsProfilePage,
});

function SettingsProfilePage() {
  const { data: settings } = useSuspenseQuery(settingsOverviewQuery);

  return (
    <SettingsSection
      title="Profile"
      description="How you appear to people you share with."
    >
      <ProfilePanel
        isProfilePublic={settings.isProfilePublic}
        receiveEmail={settings.receiveEmail}
        bio={settings.bio}
        description={settings.description}
      />
    </SettingsSection>
  );
}
