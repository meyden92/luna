import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import UserSettings from '@/components/settings/user-profile-settings';
import ThemeSelector from '@/components/theme-selector/ThemeSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';

export const Route = createFileRoute('/_dashboard/_settings/settings/')({
  head: () => ({ meta: [{ title: 'Settings | LunaShare' }] }),
  component: SettingsGeneralPage,
});

function SettingsGeneralPage() {
  const { data: settings } = useSuspenseQuery(settingsOverviewQuery);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Profile</h3>
        <p className="text-sm text-muted-foreground">This is how others will see you on the site.</p>
      </div>
      <Separator />
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose the visual theme used across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>
      <UserSettings
        className="w-full"
        receiveEmails={settings.receiveEmail}
        isProfilePublic={settings.isProfilePublic}
        bio={settings.bio || ''}
        description={settings.description || ''}
        showAllFilesIncludesFoldered={settings.showAllFilesIncludesFoldered}
      />
    </div>
  );
}
