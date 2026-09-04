import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import UserSettings from '@/components/settings/user-profile-settings';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/libs/utils';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import styles from './index.module.css';

export const Route = createFileRoute('/_dashboard/_settings/settings/')({
  head: () => ({ meta: [{ title: 'Settings | LunaShare' }] }),
  component: SettingsGeneralPage,
});

function SettingsGeneralPage() {
  const { data: settings } = useSuspenseQuery(settingsOverviewQuery);

  return (
    <div className="stack space-6">
      <div>
        <h3 className="type-lg weight-medium">Profile</h3>
        <p className={cn('type-sm', styles.subtitle)}>This is how others will see you on the site.</p>
      </div>
      <Separator />
      <UserSettings
        className={styles.full}
        receiveEmails={settings.receiveEmail}
        isProfilePublic={settings.isProfilePublic}
        bio={settings.bio || ''}
        description={settings.description || ''}
        showAllFilesIncludesFoldered={settings.showAllFilesIncludesFoldered}
      />
    </div>
  );
}
